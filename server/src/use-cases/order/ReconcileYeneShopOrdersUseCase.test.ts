import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Order } from '../../core/entities/Order.js';
import type { Product } from '../../core/entities/Product.js';
import type { User } from '../../core/entities/User.js';
import type {
  OrderRepository,
  ProductRepository,
  UserRepository,
} from '../../core/ports/repositories.js';
import type { OrderNotifier, YeneShopGateway } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { ReconcileYeneShopOrdersUseCase } from './ReconcileYeneShopOrdersUseCase.js';

const order: Order = {
  id: 'suq-order-1',
  userId: 'user-1',
  productId: 'product-1',
  productName: 'YeneShop product',
  quantity: 1,
  pricePaid: Money.fromDecimal('400'),
  costETB: '300.00',
  status: 'PAID',
  yeneshopOrderId: 'yeneshop-order-1',
  deliveredItems: null,
  failureReason: null,
  customerInput: null,
  createdAt: new Date(),
};

const product = (source: Product['source'] = 'YENESHOP'): Product => ({
  id: 'product-1',
  slug: 'product-1',
  name: 'YeneShop product',
  description: 'Redeem inside your account.',
  descriptionOverride: null,
  source,
  imageUrl: 'https://yeneshop.example/product.webp',
  deliveryType: 'MANUAL',
  deliveryMessage: null,
  input: null,
  stock: 5,
  isActive: true,
  operatorAvailable: true,
  costPriceETB: '300.00',
  suggestedRetailPrice: Money.fromDecimal('400'),
  markup: Money.ZERO,
  priceOverride: null,
  sellingPrice: Money.fromDecimal('400'),
  sortOrder: null,
  logoVersion: 0,
  updatedAt: new Date(),
});

const user = (balance = '100'): User => ({
  id: 'user-1',
  telegramId: 42n,
  username: 'customer',
  firstName: 'Customer',
  avatarUrl: null,
  balance: Money.fromDecimal(balance),
  isBanned: false,
  createdAt: new Date(),
});

describe('ReconcileYeneShopOrdersUseCase', () => {
  let orders: OrderRepository;
  let products: ProductRepository;
  let users: UserRepository;
  let yeneshop: YeneShopGateway;
  let notifier: OrderNotifier;
  let useCase: ReconcileYeneShopOrdersUseCase;

  beforeEach(() => {
    orders = {
      listAwaitingYeneShop: vi.fn().mockResolvedValue([order]),
      markAwaitingUpstream: vi.fn().mockResolvedValue(order),
      markCompleted: vi.fn().mockResolvedValue({ ...order, status: 'COMPLETED' }),
      refundPaidOrder: vi.fn().mockResolvedValue({
        order: { ...order, status: 'REFUNDED' },
        refunded: true,
      }),
    } as unknown as OrderRepository;
    products = {
      findById: vi.fn().mockResolvedValue(product()),
    } as unknown as ProductRepository;
    users = {
      findById: vi.fn().mockResolvedValue(user()),
    } as unknown as UserRepository;
    yeneshop = {
      getOrder: vi.fn().mockResolvedValue({
        yeneshopOrderId: 'yeneshop-order-1',
        externalId: order.id,
        status: 'COMPLETED',
        deliveredItems: ['LICENSE-123'],
        awaitingDelivery: false,
        instructions: null,
      }),
    } as unknown as YeneShopGateway;
    notifier = {
      notifyOrderDelivered: vi.fn().mockResolvedValue(undefined),
      notifyOrderCancelled: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new ReconcileYeneShopOrdersUseCase({
      orders,
      products,
      users,
      yeneshop,
      notifier,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(),
      } as unknown as Logger,
    });
  });

  it('completes a delivered upstream order and notifies its customer', async () => {
    await expect(useCase.execute()).resolves.toEqual({ checked: 1, completed: 1, refunded: 0 });

    expect(yeneshop.getOrder).toHaveBeenCalledWith(order.id);
    expect(orders.markCompleted).toHaveBeenCalledWith(
      order.id,
      'yeneshop-order-1',
      ['LICENSE-123'],
    );
    expect(notifier.notifyOrderDelivered).toHaveBeenCalledWith({
      telegramId: 42n,
      productName: order.productName,
      items: ['LICENSE-123'],
      instructions: 'Redeem inside your account.',
    });
  });

  it('atomically refunds a definitively failed YeneShop order', async () => {
    vi.mocked(yeneshop.getOrder).mockResolvedValue({
      yeneshopOrderId: 'yeneshop-order-1',
      externalId: order.id,
      status: 'FAILED',
      deliveredItems: [],
      awaitingDelivery: false,
      instructions: null,
    });
    vi.mocked(users.findById)
      .mockResolvedValueOnce(user('100'))
      .mockResolvedValueOnce(user('500'));

    await expect(useCase.execute()).resolves.toEqual({ checked: 1, completed: 0, refunded: 1 });
    expect(orders.refundPaidOrder).toHaveBeenCalledWith(order.id, 'YeneShop order failed');
    expect(notifier.notifyOrderCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramId: 42n,
        refundedLabel: order.pricePaid.format(),
        newBalanceLabel: Money.fromDecimal('500').format(),
      }),
    );
  });

  it('keeps a completed order pending until YeneShop returns delivery data', async () => {
    vi.mocked(yeneshop.getOrder).mockResolvedValue({
      yeneshopOrderId: 'yeneshop-order-1',
      externalId: order.id,
      status: 'COMPLETED',
      deliveredItems: [],
      awaitingDelivery: false,
      instructions: null,
    });

    await expect(useCase.execute()).resolves.toEqual({ checked: 1, completed: 0, refunded: 0 });
    expect(orders.markAwaitingUpstream).toHaveBeenCalledWith(order.id, 'yeneshop-order-1');
    expect(orders.markCompleted).not.toHaveBeenCalled();
    expect(notifier.notifyOrderDelivered).not.toHaveBeenCalled();
  });

  it('never sends legacy local orders to YeneShop', async () => {
    vi.mocked(products.findById).mockResolvedValue(product('MANUAL'));

    await expect(useCase.execute()).resolves.toEqual({ checked: 0, completed: 0, refunded: 0 });
    expect(yeneshop.getOrder).not.toHaveBeenCalled();
  });
});
