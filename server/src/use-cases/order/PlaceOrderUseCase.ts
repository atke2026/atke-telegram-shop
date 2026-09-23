import { randomUUID } from 'node:crypto';

import { priceWithDiscounts } from '../../core/entities/Discount.js';
import { Money } from '../../core/entities/Money.js';
import type { DeliveredItem } from '../../core/entities/Order.js';
import {
  isPurchasable,
  productDetails,
  validateCustomerInput,
} from '../../core/entities/Product.js';
import {
  DomainError,
  InsufficientBalanceError,
  OutOfStockError,
  ProductNotFoundError,
  SystemOfflineError,
  UserBannedError,
  UserNotFoundError,
} from '../../core/errors/DomainError.js';
import type {
  DiscountRepository,
  OrderRepository,
  ProductRepository,
  UserRepository,
} from '../../core/ports/repositories.js';
import type {
  AdminNotifier,
  YeneShopGateway,
  YeneShopOrderResult,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

export interface PlaceOrderInput {
  userId: string;
  productId: string;
  /** The buyer's answer, when the product asks them for something. */
  customerInput?: string | null;
}

/**
 * The buyer left out something the product cannot be fulfilled without. The
 * message is written for them and is safe to show — it names the field.
 */
export class CustomerInputRequiredError extends DomainError {
  readonly code = 'CUSTOMER_INPUT_REQUIRED';
}

/** How many times an unanswered upstream order is re-sent under its own id. */
const UPSTREAM_ATTEMPTS = 3;
/** Multiplied by the attempt number, so the gap widens as hope fades. */
const UPSTREAM_RETRY_MS = 1_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface PlaceOrderResult {
  orderId: string;
  productName: string;
  pricePaid: Money;
  /** The undiscounted price, so a receipt can show what was saved. */
  listPrice: Money;
  discountAmount: Money;
  newBalance: Money;
  deliveredItems: DeliveredItem[];
  /**
   * Paid for, but nothing handed over yet: the product is one the operator
   * fills in per customer, so the order is now in their queue. The buyer is
   * told to expect it shortly rather than shown an empty delivery.
   */
  awaitingDelivery: boolean;
  /** How to redeem what was just delivered; the product's own page. */
  instructions: string | null;
}

/**
 * The money path. Order of operations matters:
 *   1. validate user + product
 *   2. confirm the upstream reseller wallet can cover it
 *   3. debit atomically (this is the lock — it cannot be overdrawn)
 *   4. call YeneShop with our order id as `externalId`
 *   5. on any failure after the debit, refund
 *
 * Suq never fulfils a product itself: every live catalogue row and order is
 * validated against YeneShop's reseller API.
 */
export class PlaceOrderUseCase {
  constructor(
    private readonly deps: {
      users: UserRepository;
      products: ProductRepository;
      discounts: DiscountRepository;
      orders: OrderRepository;
      yeneshop: YeneShopGateway;
      notifier: AdminNotifier;
      logger: Logger;
      /** Gap before re-sending an unanswered order; 0 in tests. */
      upstreamRetryMs?: number;
    },
  ) {}

  async execute(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const { users, products, discounts, orders, yeneshop, notifier, logger } = this.deps;

    const user = await users.findById(input.userId);
    if (!user) throw new UserNotFoundError(input.userId);
    if (user.isBanned) throw new UserBannedError();

    const product = await products.findById(input.productId);
    if (!product) throw new ProductNotFoundError(input.productId);
    // Legacy local rows may still exist after migration for order-history
    // integrity, but Suq only sells catalogue entries obtained from YeneShop.
    if (product.source !== 'YENESHOP') throw new ProductNotFoundError(input.productId);
    if (!isPurchasable(product)) throw new OutOfStockError(product.id);

    // Checked before anything is charged: a product that cannot be fulfilled
    // without the buyer's phone number must not take their money first.
    const answered = validateCustomerInput(product, input.customerInput);
    if (!answered.ok) throw new CustomerInputRequiredError(answered.reason);

    // Priced here, from the database, at the moment of purchase. The client
    // never sends a price, so a stale or edited one cannot be charged.
    const priced = priceWithDiscounts(
      product.sellingPrice,
      product.id,
      await discounts.listActive(),
    );
    const price = priced.finalPrice;

    if (user.balance.isLessThan(price)) {
      throw new InsufficientBalanceError(price.toDecimalString(), user.balance.toDecimalString());
    }

    // Check upstream funds before taking the customer's money.
    const resellerBalance = Money.fromDecimal(await yeneshop.getResellerBalanceETB());
    const cost = Money.fromDecimal(product.costPriceETB);
    if (resellerBalance.isLessThan(cost)) {
      await notifier.alert(
        `⚠️ YeneShop reseller balance is too low for "${product.name}" ` +
          `(need ${cost.toDecimalString()} ETB, have ${resellerBalance.toDecimalString()} ETB).`,
      );
      throw new SystemOfflineError('reseller balance too low');
    }

    const orderId = randomUUID();

    // The single moment money moves. One commit creates the order already PAID
    // and takes the balance, so there is no instant in which the customer is
    // charged without an order that says so. It throws before writing anything
    // if the balance cannot cover the price.
    const { newBalance: balanceAfterDebit } = await orders.createPaidOrderAndDebit({
      id: orderId,
      userId: user.id,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      pricePaid: price,
      listPrice: priced.listPrice,
      discountAmount: priced.discountAmount,
      discountId: priced.discount?.id ?? null,
      costETB: product.costPriceETB,
      customerInput: answered.value,
    });

    const receipt = {
      orderId,
      productName: product.name,
      pricePaid: price,
      listPrice: priced.listPrice,
      discountAmount: priced.discountAmount,
      newBalance: balanceAfterDebit,
      instructions: productDetails(product),
    };

    try {
      let result: YeneShopOrderResult = await this.fulfilUpstream(
        orderId,
        product.id,
        answered.value,
      );

      if (result.awaitingDelivery || result.status === 'PAID' || result.status === 'PENDING') {
        await orders.markAwaitingUpstream(orderId, result.yeneshopOrderId);
        logger.info(
          { orderId, userId: user.id, productId: product.id, yeneshopOrderId: result.yeneshopOrderId },
          'YeneShop order accepted and awaiting delivery',
        );
        return {
          ...receipt,
          instructions: result.instructions ?? receipt.instructions,
          deliveredItems: [],
          awaitingDelivery: true,
        };
      }

      // A delivery that arrives empty is re-read once from the order record:
      // the POST body and GET /orders/:id are separate reads of the same
      // order, and the second one costs nothing.
      if (result.deliveredItems.length === 0) {
        try {
          const refetched = await yeneshop.getOrder(orderId);
          if (refetched && refetched.deliveredItems.length > 0) result = refetched;
        } catch (error) {
          // A failed second look is not a failed order — the confirmed
          // YeneShop result remains authoritative.
          logger.warn({ err: error, orderId }, 'Could not re-read the delivery from YeneShop');
        }
      }

      // Upstream can answer 200 while reversing the order itself. Treated as
      // a failure so the customer is refunded rather than charged for nothing.
      if (result.status === 'REFUNDED' || result.status === 'FAILED') {
        throw new OutOfStockError(product.id);
      }

      // A completed response without the promised delivery is not completion
      // from Suq's perspective. Keep the order PAID and let the reconciler
      // re-read YeneShop instead of fabricating a local/manual delivery path.
      if (result.deliveredItems.length === 0) {
        await orders.markAwaitingUpstream(orderId, result.yeneshopOrderId);
        await this.tell(
          `⚠️ Order ${orderId} (${product.name}) is complete in YeneShop but has no delivery data. ` +
            `It remains pending and will be checked again automatically.`,
        );
        return {
          ...receipt,
          instructions: result.instructions ?? receipt.instructions,
          deliveredItems: [],
          awaitingDelivery: true,
        };
      }

      // Past this line the goods exist. Nothing below may refund: the customer
      // is getting their item in this very response, and YeneShop has already
      // spent our reseller balance on it.
      try {
        await orders.markCompleted(
          orderId,
          result.yeneshopOrderId,
          result.deliveredItems,
        );
      } catch (error) {
        // Delivered, but we failed to write it down. Refunding here would hand
        // back money for goods the customer is about to read on screen. The
        // order stays PAID, which puts it in the delivery queue for a human,
        // and the upstream id is what they need to recover the record.
        logger.fatal(
          { err: error, orderId, yeneshopOrderId: result.yeneshopOrderId },
          'Delivered but could not record the order',
        );
        await this.tell(
          `🚨 Order ${orderId} (${product.name}) was delivered but not recorded.\n\n` +
            `YeneShop order ${result.yeneshopOrderId}. The customer has their item — ` +
            `do NOT refund; automatic reconciliation will retry the local write.`,
        );
      }
      logger.info(
        {
          orderId,
          userId: user.id,
          productId: product.id,
          source: product.source,
          yeneshopOrderId: result.yeneshopOrderId,
          discountId: priced.discount?.id ?? null,
        },
        'Order fulfilled',
      );

      return {
        ...receipt,
        instructions: result.instructions ?? receipt.instructions,
        deliveredItems: result.deliveredItems,
        awaitingDelivery: false,
      };
    } catch (error) {
      // A DomainError is YeneShop answering us: a definite rejection means the
      // order was rejected and nothing was allocated, so the money is safe to
      // return. Anything else — a timeout, a 5xx, a dropped connection — means
      // we do not know, and refunding a delivery that did happen would give
      // away both the item and the money.
      if (!(error instanceof DomainError)) {
        logger.error({ err: error, orderId }, 'Upstream outcome unknown — holding the order');
        await this.tell(
          `🚨 Order ${orderId} (${product.name}, ${price.format()}) could not be confirmed with YeneShop.\n\n` +
            `The customer has been charged and NOT refunded, because YeneShop may have delivered. ` +
            `Automatic reconciliation will query externalId ${orderId} again.`,
        );

        // Left PAID on purpose so the reconciliation worker keeps querying it.
        return { ...receipt, deliveredItems: [], awaitingDelivery: true };
      }

      const refunded = await this.refund(orderId, error);
      logger.error({ err: error, orderId, refunded }, 'Order failed after debit');

      throw error;
    }
  }

  /**
   * Places the upstream order, retrying on an unclear answer.
   *
   * `externalOrderId` is our own order id and YeneShop treats it idempotently, so
   * a retry after a timeout returns the delivery the first attempt made rather
   * than buying a second one. That is what lets a network wobble resolve
   * itself instead of becoming a refund we cannot justify.
   *
   * Errors YeneShop actually answered with are rethrown immediately — retrying a
   * 409 out-of-stock would only wait to be told the same thing.
   */
  private async fulfilUpstream(
    orderId: string,
    productId: string,
    customerInput: string | null,
  ): Promise<YeneShopOrderResult> {
    const { yeneshop, logger } = this.deps;
    let lastError: unknown;

    for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt += 1) {
      try {
        return await yeneshop.placeOrder({ productId, externalOrderId: orderId, customerInput });
      } catch (error) {
        if (error instanceof DomainError) throw error;

        lastError = error;
        logger.warn(
          { err: error, orderId, attempt },
          'YeneShop did not answer; retrying the same order id',
        );
        if (attempt < UPSTREAM_ATTEMPTS) {
          await sleep((this.deps.upstreamRetryMs ?? UPSTREAM_RETRY_MS) * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Refunds an order that upstream definitively rejected.
   *
   * The repository does the credit and the status change in one transaction,
   * guarded on the order still being PAID, so calling this twice returns the
   * money once.
   */
  private async refund(orderId: string, cause: unknown): Promise<boolean> {
    const { orders, logger } = this.deps;

    try {
      const { refunded } = await orders.refundPaidOrder(orderId, (cause as Error).message);
      return refunded;
    } catch (refundError) {
      // Money is now stuck: charged but neither delivered nor returned.
      // This always needs a human.
      logger.fatal({ err: refundError, orderId }, 'Refund failed — manual intervention required');
      await this.tell(
        `🚨 REFUND FAILED for order ${orderId}. The customer was charged; credit this wallet manually.`,
      );
      return false;
    }
  }

  /**
   * Tells the operators something, and never lets that failure become the
   * customer's problem. Every call site here has already moved money, so a
   * notification is the least important thing in the request.
   */
  private async tell(message: string): Promise<void> {
    try {
      await this.deps.notifier.alert(message);
    } catch (error) {
      this.deps.logger.error({ err: error }, 'Could not reach the operators');
    }
  }
}
