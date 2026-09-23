import { productDetails } from '../../core/entities/Product.js';
import type {
  OrderRepository,
  ProductRepository,
  UserRepository,
} from '../../core/ports/repositories.js';
import type { OrderNotifier, YeneShopGateway } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

/**
 * Settles YeneShop orders which were accepted for delayed/manual delivery or
 * whose first HTTP outcome was uncertain. The local order id is the upstream
 * externalId, so every lookup remains idempotent and attributable.
 */
export class ReconcileYeneShopOrdersUseCase {
  constructor(
    private readonly deps: {
      orders: OrderRepository;
      products: ProductRepository;
      users: UserRepository;
      yeneshop: YeneShopGateway;
      notifier: OrderNotifier;
      logger: Logger;
    },
  ) {}

  async execute(limit = 100): Promise<{ checked: number; completed: number; refunded: number }> {
    const pending = await this.deps.orders.listAwaitingYeneShop(limit);
    let checked = 0;
    let completed = 0;
    let refunded = 0;

    for (const order of pending) {
      const product = await this.deps.products.findById(order.productId);
      if (!product || product.source !== 'YENESHOP') continue;
      checked += 1;

      try {
        const upstream = await this.deps.yeneshop.getOrder(order.id);
        if (!upstream) continue;

        if (upstream.status === 'PENDING' || upstream.status === 'PAID' || upstream.awaitingDelivery) {
          await this.deps.orders.markAwaitingUpstream(order.id, upstream.yeneshopOrderId);
          continue;
        }

        const user = await this.deps.users.findById(order.userId);
        if (upstream.status === 'COMPLETED' && upstream.deliveredItems.length > 0) {
          await this.deps.orders.markCompleted(
            order.id,
            upstream.yeneshopOrderId,
            upstream.deliveredItems,
          );
          completed += 1;
          if (user) {
            await this.deps.notifier.notifyOrderDelivered({
              telegramId: user.telegramId,
              productName: order.productName,
              items: upstream.deliveredItems,
              instructions: upstream.instructions ?? productDetails(product),
            });
          }
          continue;
        }

        if (upstream.status === 'COMPLETED') {
          await this.deps.orders.markAwaitingUpstream(order.id, upstream.yeneshopOrderId);
          this.deps.logger.warn(
            { orderId: order.id, yeneshopOrderId: upstream.yeneshopOrderId },
            'YeneShop order completed without delivery data; keeping it pending',
          );
          continue;
        }

        const outcome = await this.deps.orders.refundPaidOrder(
          order.id,
          `YeneShop order ${upstream.status.toLowerCase()}`,
        );
        if (!outcome.refunded) continue;
        refunded += 1;
        if (user) {
          const refreshed = await this.deps.users.findById(user.id);
          await this.deps.notifier.notifyOrderCancelled({
            telegramId: user.telegramId,
            productName: order.productName,
            refundedLabel: order.pricePaid.format(),
            newBalanceLabel: refreshed?.balance.format() ?? null,
            reason: 'YeneShop could not complete the order.',
          });
        }
      } catch (error) {
        this.deps.logger.error(
          { err: error, orderId: order.id },
          'Could not reconcile pending YeneShop order',
        );
      }
    }

    return { checked, completed, refunded };
  }
}
