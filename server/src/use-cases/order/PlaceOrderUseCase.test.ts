import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import type { User } from '../../core/entities/User.js';
import {
  InsufficientBalanceError,
  OutOfStockError,
  SystemOfflineError,
} from '../../core/errors/DomainError.js';
import type {
  DiscountRepository,
  OrderRepository,
  ProductRepository,
  UserRepository,
} from '../../core/ports/repositories.js';
import type { AdminNotifier, YeneShopGateway } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { CustomerInputRequiredError, PlaceOrderUseCase } from './PlaceOrderUseCase.js';

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
    avatarUrl: null,
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
    operatorAvailable: true,
    costPriceETB: '2.00',
    markup: Money.fromDecimal('20'),
    priceOverride: null,
    descriptionOverride: null,
    source: 'YENESHOP',
    deliveryMessage: null,
    input: null,
    sellingPrice: Money.fromDecimal('340'),
    sortOrder: null,
    logoVersion: 0,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PlaceOrderUseCase', () => {
  let users: UserRepository;
  let products: ProductRepository;
  let orders: OrderRepository;
  let discounts: DiscountRepository;
  let yeneshop: YeneShopGateway;
  let notifier: AdminNotifier;
  let useCase: PlaceOrderUseCase;

  beforeEach(() => {
    users = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      findByTelegramId: vi.fn(),
      create: vi.fn(),
      adjustBalance: vi.fn().mockResolvedValue(makeUser({ balance: Money.fromDecimal('660') })),
      search: vi.fn(),
      setBanned: vi.fn(),
      listBroadcastRecipients: vi.fn(),
    };

    products = {
      findById: vi.fn().mockResolvedValue(makeProduct()),
      findBySlugOrId: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([]),
      bumpLogoVersion: vi.fn(),
      listActive: vi.fn(),
      setPriceOverride: vi.fn(),
      setOperatorAvailable: vi.fn(),
      setDescription: vi.fn(),
      upsertMany: vi.fn(),
      setSortOrder: vi.fn(),
      clearSortOrder: vi.fn(),
      deactivateMissing: vi.fn(),
    };

    discounts = {
      // No discounts by default; individual tests override this.
      listActive: vi.fn().mockResolvedValue([]),
      listAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      setActive: vi.fn(),
      remove: vi.fn(),
    };

    orders = {
      create: vi.fn().mockImplementation(async (input) => ({ ...input, status: 'PENDING' })),
      findById: vi.fn(),
      listByUser: vi.fn(),
      markCompleted: vi.fn().mockResolvedValue({}),
      markAwaitingUpstream: vi.fn().mockResolvedValue({}),
      markStatus: vi.fn().mockResolvedValue({}),
      // One call now does what create + debit + mark-PAID used to; the mock
      // mirrors that so a test cannot pass against a flow that no longer exists.
      createPaidOrderAndDebit: vi.fn().mockImplementation(async (input) => ({
        order: { ...input, status: 'PAID' },
        newBalance: Money.fromDecimal('660'),
      })),
      refundPaidOrder: vi.fn().mockImplementation(async (orderId: string) => ({
        order: { id: orderId, status: 'REFUNDED' },
        refunded: true,
      })),
      soldUnitsSince: vi.fn().mockResolvedValue(new Map()),
      listAwaitingYeneShop: vi.fn().mockResolvedValue([]),
      hasAnyOrder: vi.fn().mockResolvedValue(true),
    };

    yeneshop = {
      getProducts: vi.fn(),
      getOrder: vi.fn().mockResolvedValue(null),
      getResellerBalanceETB: vi.fn().mockResolvedValue('150.00'),
      placeOrder: vi.fn().mockResolvedValue({
        yeneshopOrderId: 'yeneshop-99',
        deliveredItems: [{ code: 'SECRET-123' }],
        idempotentReplay: false,
      }),
    };

    notifier = { alert: vi.fn().mockResolvedValue(undefined) };

    useCase = new PlaceOrderUseCase({
      users,
      products,
      discounts,
      orders,
      yeneshop,
      notifier,
      logger: silentLogger,
      // The retry backoff is real time; tests assert the behaviour, not the wait.
      upstreamRetryMs: 0,
    });
  });

  it('debits the wallet and returns the delivered items on success', async () => {
    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    expect(result.deliveredItems).toEqual([{ code: 'SECRET-123' }]);
    expect(orders.createPaidOrderAndDebit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', pricePaid: Money.fromDecimal('340') }),
    );
    expect(orders.markCompleted).toHaveBeenCalledWith(result.orderId, 'yeneshop-99', [{ code: 'SECRET-123' }]);
  });

  it('sends our order id as the idempotency key', async () => {
    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    expect(yeneshop.placeOrder).toHaveBeenCalledWith({
      productId: 'prod-1',
      customerInput: null,
      externalOrderId: result.orderId,
    });
  });

  it('refuses when the wallet cannot cover the price', async () => {
    users.findById = vi.fn().mockResolvedValue(makeUser({ balance: Money.fromDecimal('10') }));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
      InsufficientBalanceError,
    );
    expect(orders.createPaidOrderAndDebit).not.toHaveBeenCalled();
  });

  it('refuses out-of-stock products before touching money', async () => {
    products.findById = vi.fn().mockResolvedValue(makeProduct({ stock: 0 }));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(OutOfStockError);
    expect(yeneshop.placeOrder).not.toHaveBeenCalled();
  });

  it('refuses a product the operator marked unavailable before touching money', async () => {
    products.findById = vi
      .fn()
      .mockResolvedValue(makeProduct({ operatorAvailable: false }));

    await expect(
      useCase.execute({ userId: 'user-1', productId: 'prod-1' }),
    ).rejects.toThrow(OutOfStockError);
    expect(orders.createPaidOrderAndDebit).not.toHaveBeenCalled();
    expect(yeneshop.placeOrder).not.toHaveBeenCalled();
  });

  it('goes offline and alerts the admin when the reseller wallet is short', async () => {
    yeneshop.getResellerBalanceETB = vi.fn().mockResolvedValue('0.50');

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(SystemOfflineError);
    expect(notifier.alert).toHaveBeenCalled();
    expect(orders.createPaidOrderAndDebit).not.toHaveBeenCalled();
  });

  it('refuses legacy local products without contacting YeneShop', async () => {
    products.findById = vi.fn().mockResolvedValue(makeProduct({ source: 'MANUAL' }));

    await expect(
      useCase.execute({ userId: 'user-1', productId: 'prod-1' }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(yeneshop.getResellerBalanceETB).not.toHaveBeenCalled();
    expect(yeneshop.placeOrder).not.toHaveBeenCalled();
    expect(orders.createPaidOrderAndDebit).not.toHaveBeenCalled();
  });

  it('re-reads the order when the delivery comes back empty', async () => {
    yeneshop.placeOrder = vi.fn().mockResolvedValue({
      yeneshopOrderId: 'yeneshop-99',
      deliveredItems: [],
      status: 'delivered',
      idempotentReplay: false,
    });
    yeneshop.getOrder = vi.fn().mockResolvedValue({
      yeneshopOrderId: 'yeneshop-99',
      deliveredItems: ['https://activation.example/AQCp'],
      status: 'delivered',
      idempotentReplay: false,
    });

    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    expect(yeneshop.getOrder).toHaveBeenCalledWith(result.orderId);
    expect(result.deliveredItems).toEqual(['https://activation.example/AQCp']);
    expect(orders.markCompleted).toHaveBeenCalledWith(result.orderId, 'yeneshop-99', [
      'https://activation.example/AQCp',
    ]);
  });

  it('keeps an empty YeneShop delivery pending without refunding', async () => {
    yeneshop.placeOrder = vi.fn().mockResolvedValue({
      yeneshopOrderId: 'yeneshop-99',
      deliveredItems: [],
      status: 'delivered',
      idempotentReplay: false,
    });
    yeneshop.getOrder = vi.fn().mockResolvedValue(null);

    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    expect(notifier.alert).toHaveBeenCalledWith(expect.stringContaining('no delivery data'));
    // The stock is gone upstream and the items may be recoverable, so the
    // wallet is not credited back — only the debit happened.
    expect(orders.refundPaidOrder).not.toHaveBeenCalled();
    expect(orders.markAwaitingUpstream).toHaveBeenCalledWith(
      result.orderId,
      'yeneshop-99',
    );
    expect(orders.markCompleted).not.toHaveBeenCalled();
    expect(result.deliveredItems).toEqual([]);
    expect(result.awaitingDelivery).toBe(true);
  });

  it('refunds when upstream reports the order as refunded', async () => {
    yeneshop.placeOrder = vi.fn().mockResolvedValue({
      yeneshopOrderId: 'yeneshop-99',
      deliveredItems: [],
      status: 'REFUNDED',
      idempotentReplay: false,
    });

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
      OutOfStockError,
    );
    expect(orders.refundPaidOrder).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it('refunds when YeneShop rejects the order outright', async () => {
    yeneshop.placeOrder = vi.fn().mockRejectedValue(new OutOfStockError('prod-1'));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(OutOfStockError);

    // A DomainError is YeneShop answering: nothing was allocated, so the money
    // goes back. The repository does the credit and the status in one commit.
    expect(orders.refundPaidOrder).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it('charges the discounted price, not the list price', async () => {
    discounts.listActive = vi.fn().mockResolvedValue([
      {
        id: 'd1',
        scope: 'ALL',
        productId: null,
        type: 'PERCENT',
        value: '25',
        label: null,
        isActive: true,
        startsAt: null,
        endsAt: null,
        createdAt: new Date(),
      },
    ]);

    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

    // 340 list, 25% off, so 255 is debited and recorded.
    expect(result.pricePaid.toDecimalString()).toBe('255.00');
    expect(result.listPrice.toDecimalString()).toBe('340.00');
    expect(result.discountAmount.toDecimalString()).toBe('85.00');
    expect(orders.createPaidOrderAndDebit).toHaveBeenCalledWith(
      expect.objectContaining({ discountId: 'd1', pricePaid: Money.fromDecimal('255') }),
    );
  });

  it('refunds the discounted price, not the list price', async () => {
    discounts.listActive = vi.fn().mockResolvedValue([
      {
        id: 'd1',
        scope: 'PRODUCT',
        productId: 'prod-1',
        type: 'FIXED',
        value: '40',
        label: null,
        isActive: true,
        startsAt: null,
        endsAt: null,
        createdAt: new Date(),
      },
    ]);
    yeneshop.placeOrder = vi.fn().mockRejectedValue(new OutOfStockError('prod-1'));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
      OutOfStockError,
    );

    // The refund credits whatever the order row says was paid, so charging the
    // discounted price is what guarantees the discounted price comes back.
    expect(orders.createPaidOrderAndDebit).toHaveBeenCalledWith(
      expect.objectContaining({ pricePaid: Money.fromDecimal('300') }),
    );
    expect(orders.refundPaidOrder).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  it('lets a discount make the balance sufficient', async () => {
    users.findById = vi.fn().mockResolvedValue(makeUser({ balance: Money.fromDecimal('300') }));
    discounts.listActive = vi.fn().mockResolvedValue([
      {
        id: 'd1',
        scope: 'ALL',
        productId: null,
        type: 'PERCENT',
        value: '20',
        label: null,
        isActive: true,
        startsAt: null,
        endsAt: null,
        createdAt: new Date(),
      },
    ]);

    // 340 is out of reach, 272 is not.
    const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });
    expect(result.pricePaid.toDecimalString()).toBe('272.00');
  });

  it('escalates to the admin when even the refund fails', async () => {
    yeneshop.placeOrder = vi.fn().mockRejectedValue(new OutOfStockError('prod-1'));
    orders.refundPaidOrder = vi.fn().mockRejectedValue(new Error('db down'));

    await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
      OutOfStockError,
    );

    expect(notifier.alert).toHaveBeenCalledWith(expect.stringContaining('REFUND FAILED'));
  });

  describe('when the product asks the buyer for something', () => {
    const asking = (type: 'TEXT' | 'NUMBER' = 'TEXT'): Product =>
      makeProduct({
        input: { type, placeholder: 'Your phone number' },
      });

    it('refuses to charge without an answer', async () => {
      products.findById = vi.fn().mockResolvedValue(asking());

      await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
        CustomerInputRequiredError,
      );
      // Checked before the money moves, not after.
      expect(orders.createPaidOrderAndDebit).not.toHaveBeenCalled();
    });

    it('refuses an answer that is only whitespace', async () => {
      products.findById = vi.fn().mockResolvedValue(asking());

      await expect(
        useCase.execute({ userId: 'user-1', productId: 'prod-1', customerInput: '   ' }),
      ).rejects.toThrow(CustomerInputRequiredError);
    });

    it('records the answer on the order, trimmed', async () => {
      products.findById = vi.fn().mockResolvedValue(asking());

      await useCase.execute({ userId: 'user-1', productId: 'prod-1', customerInput: '  0911223344 ' });

      expect(orders.createPaidOrderAndDebit).toHaveBeenCalledWith(
        expect.objectContaining({ customerInput: '0911223344' }),
      );
    });

    it('sends the trimmed answer to YeneShop', async () => {
      products.findById = vi.fn().mockResolvedValue(asking());

      await useCase.execute({ userId: 'user-1', productId: 'prod-1', customerInput: ' 0911223344 ' });

      expect(yeneshop.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerInput: '0911223344' }),
      );
    });

    it('rejects letters when the field asks for a number', async () => {
      products.findById = vi.fn().mockResolvedValue(asking('NUMBER'));

      await expect(
        useCase.execute({ userId: 'user-1', productId: 'prod-1', customerInput: 'not a number' }),
      ).rejects.toThrow(CustomerInputRequiredError);
    });

    it('accepts a phone number written the way people write them', async () => {
      products.findById = vi.fn().mockResolvedValue(asking('NUMBER'));

      await expect(
        useCase.execute({ userId: 'user-1', productId: 'prod-1', customerInput: '+251 91 234 5678' }),
      ).resolves.toBeDefined();
    });

    it('ignores an answer to a product that asked nothing', async () => {
      // The catalogue product has no field; anything sent alongside is dropped
      // rather than recorded against a question that was never posed.
      await useCase.execute({ userId: 'user-1', productId: 'prod-1', customerInput: 'unsolicited' });

      expect(orders.createPaidOrderAndDebit).toHaveBeenCalledWith(
        expect.objectContaining({ customerInput: null }),
      );
    });
  });

  /**
   * The paths where money and goods can part company. Each one is a way the
   * shop could previously have charged someone for nothing, or given away an
   * item and the money for it.
   */
  describe('when something fails after the customer has paid', () => {
    it('never refunds an order YeneShop might have delivered', async () => {
      // A timeout is not an answer: YeneShop may have fulfilled it.
      yeneshop.placeOrder = vi.fn().mockRejectedValue(new Error('YeneShop request timed out after 15000ms'));

      const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

      expect(orders.refundPaidOrder).not.toHaveBeenCalled();
      // Held as owed rather than failed, so the customer waits instead of
      // buying it a second time.
      expect(result.awaitingDelivery).toBe(true);
      expect(notifier.alert).toHaveBeenCalledWith(expect.stringContaining('could not be confirmed'));
    });

    it('retries an unanswered order under the same id rather than buying twice', async () => {
      yeneshop.placeOrder = vi
        .fn()
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce({
          yeneshopOrderId: 'yeneshop-99',
          deliveredItems: ['SECRET-123'],
          status: 'delivered',
          idempotentReplay: true,
        });

      const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

      expect(yeneshop.placeOrder).toHaveBeenCalledTimes(2);
      // Same external id both times — that is what makes the retry safe.
      const [first, second] = (yeneshop.placeOrder as unknown as { mock: { calls: [{ externalOrderId: string }][] } }).mock.calls;
      expect(first![0].externalOrderId).toBe(second![0].externalOrderId);
      expect(result.deliveredItems).toEqual(['SECRET-123']);
      expect(orders.refundPaidOrder).not.toHaveBeenCalled();
    });

    it('does not retry an order YeneShop explicitly rejected', async () => {
      yeneshop.placeOrder = vi.fn().mockRejectedValue(new OutOfStockError('prod-1'));

      await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
        OutOfStockError,
      );

      expect(yeneshop.placeOrder).toHaveBeenCalledTimes(1);
    });

    it('keeps a delivered order when it cannot be written down', async () => {
      orders.markCompleted = vi.fn().mockRejectedValue(new Error('db down'));

      const result = await useCase.execute({ userId: 'user-1', productId: 'prod-1' });

      // The customer is holding the item in this very response; refunding
      // would hand back the money for goods they already have.
      expect(orders.refundPaidOrder).not.toHaveBeenCalled();
      expect(result.deliveredItems).toEqual([{ code: 'SECRET-123' }]);
      expect(notifier.alert).toHaveBeenCalledWith(expect.stringContaining('do NOT refund'));
    });

    it('writes nothing when the debit cannot be taken', async () => {
      orders.createPaidOrderAndDebit = vi
        .fn()
        .mockRejectedValue(new InsufficientBalanceError('340', '10'));

      await expect(useCase.execute({ userId: 'user-1', productId: 'prod-1' })).rejects.toThrow(
        InsufficientBalanceError,
      );

      expect(yeneshop.placeOrder).not.toHaveBeenCalled();
      expect(orders.refundPaidOrder).not.toHaveBeenCalled();
    });


  });
});
