import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import { InvalidAmountError } from '../../core/errors/DomainError.js';
import type { DepositRepository, ProductRepository, UserRepository } from '../../core/ports/repositories.js';
import { FALLBACK_MIN_DEPOSIT, RequestDepositUseCase } from './RequestDepositUseCase.js';

function makeProduct(price: string): Product {
  return {
    id: `p-${price}`,
    slug: `p-${price}`,
    name: `Product ${price}`,
    description: null,
    descriptionOverride: null,
    stock: 5,
    isActive: true,
    costPriceUSDT: '1',
    markup: Money.ZERO,
    priceOverride: null,
    sellingPrice: Money.fromDecimal(price),
    updatedAt: new Date(),
  };
}

describe('RequestDepositUseCase', () => {
  let users: UserRepository;
  let deposits: DepositRepository;
  let products: ProductRepository;
  let useCase: RequestDepositUseCase;

  beforeEach(() => {
    users = {
      findById: vi.fn().mockResolvedValue({
        id: 'user-1',
        telegramId: 1n,
        username: null,
        firstName: 'Test',
        avatarUrl: null,
        balance: Money.ZERO,
        isBanned: false,
        createdAt: new Date(),
      }),
      findByTelegramId: vi.fn(),
      create: vi.fn(),
      adjustBalance: vi.fn(),
    };

    deposits = {
      create: vi.fn().mockImplementation(async (data) => ({ id: 'd1', ...data })),
      findById: vi.fn(),
      listByStatus: vi.fn(),
      approveAndCredit: vi.fn(),
      reject: vi.fn(),
    };

    products = {
      findById: vi.fn(),
      findBySlugOrId: vi.fn(),
      listActive: vi.fn().mockResolvedValue([makeProduct('9500'), makeProduct('2000'), makeProduct('3900')]),
      setPriceOverride: vi.fn(),
      setDescription: vi.fn(),
      upsertMany: vi.fn(),
      deactivateMissing: vi.fn(),
    };

    useCase = new RequestDepositUseCase({ users, deposits, products });
  });

  const request = (amountETB: string) =>
    useCase.execute({ userId: 'user-1', amountETB, screenshotUrl: 'file-id' });

  it('takes the minimum from the cheapest product on sale', async () => {
    expect((await useCase.minimumDeposit()).toDecimalString()).toBe('2000.00');
  });

  it('follows a price change without a code change', async () => {
    products.listActive = vi.fn().mockResolvedValue([makeProduct('750'), makeProduct('9500')]);

    expect((await useCase.minimumDeposit()).toDecimalString()).toBe('750.00');
  });

  it('falls back when the catalogue is empty rather than blocking deposits', async () => {
    products.listActive = vi.fn().mockResolvedValue([]);

    expect((await useCase.minimumDeposit()).toDecimalString()).toBe(
      FALLBACK_MIN_DEPOSIT.toDecimalString(),
    );
  });

  it('rejects an amount below the cheapest product', async () => {
    await expect(request('1999')).rejects.toThrow(InvalidAmountError);
    expect(deposits.create).not.toHaveBeenCalled();
  });

  it('accepts exactly the minimum', async () => {
    await request('2000');

    expect(deposits.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: Money.fromDecimal('2000') }),
    );
  });

  it('rejects a non-numeric amount', async () => {
    await expect(request('abc')).rejects.toThrow(InvalidAmountError);
  });

  it('rejects an amount above the maximum', async () => {
    await expect(request('100001')).rejects.toThrow(InvalidAmountError);
  });
});
