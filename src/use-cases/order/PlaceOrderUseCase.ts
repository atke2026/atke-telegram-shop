import { randomUUID } from 'node:crypto';

import { Money } from '../../core/entities/Money.js';
import type { DeliveredItem } from '../../core/entities/Order.js';
import { isPurchasable } from '../../core/entities/Product.js';
import {
  DomainError,
  InsufficientBalanceError,
  OutOfStockError,
  ProductNotFoundError,
  SystemOfflineError,
  UserBannedError,
  UserNotFoundError,
} from '../../core/errors/DomainError.js';
import type { OrderRepository, ProductRepository, UserRepository } from '../../core/ports/repositories.js';
import type { AdminNotifier, HubxGateway } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

export interface PlaceOrderInput {
  userId: string;
  productId: string;
}

export interface PlaceOrderResult {
  orderId: string;
  productName: string;
  pricePaid: Money;
  newBalance: Money;
  deliveredItems: DeliveredItem[];
}

/**
 * The money path. Order of operations matters:
 *   1. validate user + product
 *   2. confirm the upstream reseller wallet can cover it
 *   3. debit atomically (this is the lock — it cannot be overdrawn)
 *   4. call HubX with our order id as `external_order_id`
 *   5. on any failure after the debit, refund
 */
export class PlaceOrderUseCase {
  constructor(
    private readonly deps: {
      users: UserRepository;
      products: ProductRepository;
      orders: OrderRepository;
      hubx: HubxGateway;
      notifier: AdminNotifier;
      logger: Logger;
    },
  ) {}

  async execute(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const { users, products, orders, hubx, notifier, logger } = this.deps;

    const user = await users.findById(input.userId);
    if (!user) throw new UserNotFoundError(input.userId);
    if (user.isBanned) throw new UserBannedError();

    const product = await products.findById(input.productId);
    if (!product) throw new ProductNotFoundError(input.productId);
    if (!isPurchasable(product)) throw new OutOfStockError(product.id);

    const price = product.sellingPrice;
    if (user.balance.isLessThan(price)) {
      throw new InsufficientBalanceError(price.toDecimalString(), user.balance.toDecimalString());
    }

    // Check upstream funds before taking the customer's money.
    const resellerBalance = Money.fromDecimal(await hubx.getResellerBalanceUSDT());
    const cost = Money.fromDecimal(product.costPriceUSDT);
    if (resellerBalance.isLessThan(cost)) {
      await notifier.alert(
        `⚠️ HubX reseller balance is too low for "${product.name}" ` +
          `(need ${cost.toDecimalString()} USDT, have ${resellerBalance.toDecimalString()} USDT).`,
      );
      throw new SystemOfflineError('reseller balance too low');
    }

    const orderId = randomUUID();
    await orders.create({
      id: orderId,
      userId: user.id,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      pricePaid: price,
      costUSDT: product.costPriceUSDT,
    });

    // Debit first: the conditional update in adjustBalance is what makes two
    // simultaneous purchases safe. If HubX then fails, we refund below.
    let balanceAfterDebit: Money;
    try {
      const debited = await users.adjustBalance(user.id, Money.ZERO.subtract(price));
      balanceAfterDebit = debited.balance;
    } catch (error) {
      await orders.markStatus(orderId, 'FAILED', 'debit failed');
      throw error;
    }

    await orders.markStatus(orderId, 'PAID');

    try {
      const result = await hubx.placeOrder({
        productId: product.id,
        quantity: 1,
        externalOrderId: orderId,
      });

      await orders.markCompleted(orderId, result.hubxOrderId, result.deliveredItems);
      logger.info(
        {
          orderId,
          userId: user.id,
          productId: product.id,
          hubxOrderId: result.hubxOrderId,
          // Should never be true on a fresh UUID; if it is, HubX saw this id before.
          idempotentReplay: result.idempotentReplay,
        },
        'Order fulfilled',
      );

      return {
        orderId,
        productName: product.name,
        pricePaid: price,
        newBalance: balanceAfterDebit,
        deliveredItems: result.deliveredItems,
      };
    } catch (error) {
      const refunded = await this.refund(orderId, user.id, price, error);
      logger.error({ err: error, orderId, refunded }, 'Order failed after debit');

      if (!(error instanceof DomainError)) {
        await notifier.alert(`❌ Order ${orderId} failed unexpectedly: ${(error as Error).message}`);
      }

      throw error;
    }
  }

  private async refund(orderId: string, userId: string, price: Money, cause: unknown): Promise<boolean> {
    const { users, orders, notifier, logger } = this.deps;

    try {
      await users.adjustBalance(userId, price);
      await orders.markStatus(orderId, 'REFUNDED', (cause as Error).message);
      return true;
    } catch (refundError) {
      // Money is now stuck: charged but neither delivered nor returned.
      // This always needs a human.
      logger.fatal({ err: refundError, orderId, userId }, 'Refund failed — manual intervention required');
      await notifier.alert(
        `🚨 REFUND FAILED for order ${orderId} (user ${userId}, ${price.format()}). Credit this wallet manually.`,
      );
      return false;
    }
  }
}
