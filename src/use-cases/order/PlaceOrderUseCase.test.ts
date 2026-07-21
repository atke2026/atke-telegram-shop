import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import type { User } from '../../core/entities/User.js';
import {
  InsufficientBalanceError,
  OutOfStockError,
  SystemOfflineError,
} from '../../core/errors/DomainError.js';
import type { OrderRepository, ProductRepository, UserRepository } from '../../core/ports/repositories.js';
import type { AdminNotifier, HubxGateway } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { PlaceOrderUseCase } from './PlaceOrderUseCase.js';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as Logger;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    telegramId: 1n,
    username: 'tester',
    firstName: 'Test',
    balance: Money.fromDecimal('1000'),
    isBanned: false,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    slug: 'google-ai-pro',
    name: 'Google AI Pro',
    description: null,
    stock: 5,
    isActive: true,
    costPriceUSDT: '2.00',
    markup: Money.fromDecimal('20'),
    sellingPrice: Money.fromDecimal('340'),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlaceOrderUseCase', () => {
  let users: UserRepository;
  let products: ProductRepository;
  let orders: OrderRepository;
  let hubx: HubxGateway;
  let notifier: AdminNotifier;
  let useCase: PlaceOrderUseCase;

  beforeEach(() => {
    users = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      findByTelegramId: vi.fn(),
      create: vi.fn(),
      adjustBalance: vi.fn().mockResolvedValue(makeUser({ balance: Money.fromDecimal('660') })),
    };

    products = {
      findById: vi.fn().mockResolvedValue(makeProduct()),
      listActive: vi.fn(),
      upsertMany: vi.fn(),
      deactivateMissing: vi.fn(),
    };

    orders = {
      create: vi.fn().mockImplementation(async (input) => ({ ...input, status: 'PENDING' })),
      findById: vi.fn(),
      listByUser: vi.fn(),
      markCompleted: vi.fn().mockResolvedValue({}),
      markStatus: vi.fn().mockResolvedValue({}),
    };

    hubx = {
      getProducts: vi.fn(),
      getResellerBalanceUSDT: vi.fn().mockResolvedValue('150.00'),
      placeOrder: vi.fn().mockResolvedValue({
        hubxOrderId: 'hubx-99',
        deliveredItems: [{ code: 'SECRET-123' }],
      }),
    };

    notifier = { alert: vi.fn().mockResolvedValue(undefined) };

    useCase = new PlaceOrderUseCase({ users, products, orders, hubx, notifier, logger: silentLogger });
  });

  it('debits the wallet and returns the delivered items on success', async () => {
    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    expect(result.deliveredItems).toEqual([{ code: 'SECRET-123' }]);
    expect(users.adjustBalance).toHaveBeenCalledWith('user-1', Money.fromDecimal('-340'));
    expect(orders.markCompleted).toHaveBeenCalledWith(result.orderId, 'hubx-99', [{ code: 'SECRET-123' }]);
  });

  it('sends our order id as the idempotency key', async () => {
    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    expect(hubx.placeOrder).toHaveBeenCalledWith({
      productId: 'prod-1',
      quantity: 1,
      externalOrderId: result.orderId,
    });
  });

  it('refuses when the wallet cannot cover the price', async () => {
    users.findById = vi.fn().mockResolvedValue(makeUser({ balance: Money.fromDecimal('10') }));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
      InsufficientBalanceError,
    );
    expect(users.adjustBalance).not.toHaveBeenCalled();
  });

  it('refuses out-of-stock products before touching money', async () => {
    products.findById = vi.fn().mockResolvedValue(makeProduct({ stock: 0 }));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(OutOfStockError);
    expect(hubx.placeOrder).not.toHaveBeenCalled();
  });

  it('goes offline and alerts the admin when the reseller wallet is short', async () => {
    hubx.getResellerBalanceUSDT = vi.fn().mockResolvedValue('0.50');

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(SystemOfflineError);
    expect(notifier.alert).toHaveBeenCalled();
    expect(users.adjustBalance).not.toHaveBeenCalled();
  });

  it('refunds the customer when HubX fails after the debit', async () => {
    hubx.placeOrder = vi.fn().mockRejectedValue(new OutOfStockError('prod-1'));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(OutOfStockError);

    expect(users.adjustBalance).toHaveBeenNthCalledWith(1, 'user-1', Money.fromDecimal('-340'));
    expect(users.adjustBalance).toHaveBeenNthCalledWith(2, 'user-1', Money.fromDecimal('340'));
    expect(orders.markStatus).toHaveBeenCalledWith(expect.any(String), 'REFUNDED', expect.any(String));
  });

  it('escalates to the admin when even the refund fails', async () => {
    hubx.placeOrder = vi.fn().mockRejectedValue(new Error('network down'));
    users.adjustBalance = vi
      .fn()
      .mockResolvedValueOnce(makeUser({ balance: Money.fromDecimal('660') }))
      .mockRejectedValueOnce(new Error('db down'));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow('network down');

    expect(notifier.alert).toHaveBeenCalledWith(expect.stringContaining('REFUND FAILED'));
  });
});
