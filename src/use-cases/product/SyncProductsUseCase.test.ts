import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import type { ConfigRepository, ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort, HubxGateway, HubxProduct } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { SyncProductsUseCase } from './SyncProductsUseCase.js';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;

const UPSTREAM: HubxProduct = {
  id: 'p1',
  slug: 'google-ai-pro',
  name: 'Google AI Pro (18m)',
  description: null,
  stock: 4,
  isActive: true,
  priceUSDT: '1',
};

function existingProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'google-ai-pro',
    name: 'Google AI Pro (18m)',
    description: null,
    stock: 4,
    isActive: true,
    costPriceUSDT: '1',
    markup: Money.ZERO,
    priceOverride: null,
    sellingPrice: Money.fromDecimal('160'),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SyncProductsUseCase', () => {
  let products: ProductRepository;
  let config: ConfigRepository;
  let cache: CachePort;
  let hubx: HubxGateway;
  let upserted: Product[];

  beforeEach(() => {
    upserted = [];

    products = {
      findById: vi.fn(),
      findBySlugOrId: vi.fn(),
      listActive: vi.fn().mockResolvedValue([]),
      setPriceOverride: vi.fn(),
      upsertMany: vi.fn().mockImplementation(async (rows: Product[]) => {
        upserted = rows;
        return rows.length;
      }),
      deactivateMissing: vi.fn().mockResolvedValue(0),
    };

    config = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
    hubx = {
      getProducts: vi.fn().mockResolvedValue([UPSTREAM]),
      getProduct: vi.fn(),
      getOrder: vi.fn(),
      getResellerBalanceUSDT: vi.fn(),
      placeOrder: vi.fn(),
    };
  });

  const run = () =>
    new SyncProductsUseCase({ hubx, products, config, cache, defaultRate: '160', logger: silentLogger }).execute();

  it('prices new products at cost * rate', async () => {
    await run();

    expect(upserted[0]?.sellingPrice.toDecimalString()).toBe('160.00');
  });

  it('preserves the operator markup across a sync', async () => {
    products.listActive = vi.fn().mockResolvedValue([existingProduct({ markup: Money.fromDecimal('40') })]);

    await run();

    expect(upserted[0]?.sellingPrice.toDecimalString()).toBe('200.00');
  });

  it('keeps a fixed price instead of recomputing it', async () => {
    products.listActive = vi
      .fn()
      .mockResolvedValue([existingProduct({ priceOverride: Money.fromDecimal('2500') })]);

    await run();

    expect(upserted[0]?.sellingPrice.toDecimalString()).toBe('2500.00');
    expect(upserted[0]?.priceOverride?.toDecimalString()).toBe('2500.00');
  });

  it('leaves a fixed price untouched when the exchange rate changes', async () => {
    config.get = vi.fn().mockResolvedValue('250');
    products.listActive = vi
      .fn()
      .mockResolvedValue([existingProduct({ priceOverride: Money.fromDecimal('2500') })]);

    await run();

    // Auto pricing would have moved to 250.00; the fixed price must not.
    expect(upserted[0]?.sellingPrice.toDecimalString()).toBe('2500.00');
  });

  it('follows the exchange rate when no price is fixed', async () => {
    config.get = vi.fn().mockResolvedValue('250');

    await run();

    expect(upserted[0]?.sellingPrice.toDecimalString()).toBe('250.00');
  });
});
