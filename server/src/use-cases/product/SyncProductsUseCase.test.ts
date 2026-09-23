import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort, YeneShopGateway, YeneShopProduct } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { SyncProductsUseCase } from './SyncProductsUseCase.js';

const logger = { info: vi.fn() } as unknown as Logger;
const upstream: YeneShopProduct = {
  id: 'p1',
  slug: 'google-ai-pro',
  name: 'Google AI Pro',
  description: 'Details from YeneShop',
  imageUrl: 'https://yeneshop.test/logos/google-ai-pro.webp?v=2',
  stock: 4,
  isActive: true,
  resellerPriceETB: '250.00',
  suggestedRetailPriceETB: '340.00',
  deliveryType: 'MANUAL',
  input: { type: 'TEXT', placeholder: 'Customer email' },
};

function existing(overrides: Partial<Product> = {}): Product {
  return {
    id: upstream.id,
    slug: upstream.slug,
    name: upstream.name,
    description: null,
    descriptionOverride: null,
    source: 'YENESHOP',
    imageUrl: upstream.imageUrl,
    deliveryType: 'INSTANT',
    deliveryMessage: null,
    input: null,
    stock: 1,
    isActive: true,
    operatorAvailable: true,
    costPriceETB: '200.00',
    suggestedRetailPrice: Money.fromDecimal('300'),
    markup: Money.ZERO,
    priceOverride: null,
    sellingPrice: Money.fromDecimal('300'),
    sortOrder: null,
    logoVersion: 0,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SyncProductsUseCase', () => {
  let products: ProductRepository;
  let cache: CachePort;
  let yeneshop: YeneShopGateway;
  let saved: Product[];

  beforeEach(() => {
    saved = [];
    products = {
      findById: vi.fn(), findBySlugOrId: vi.fn(), listActive: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([]),
      setPriceOverride: vi.fn(), setOperatorAvailable: vi.fn(), bumpLogoVersion: vi.fn(),
      setDescription: vi.fn(), setSortOrder: vi.fn(), clearSortOrder: vi.fn(),
      upsertMany: vi.fn().mockImplementation(async (rows: Product[]) => { saved = rows; return rows.length; }),
      deactivateMissing: vi.fn().mockResolvedValue(0),
    };
    cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
    yeneshop = {
      getProducts: vi.fn().mockResolvedValue([upstream]),
      getResellerBalanceETB: vi.fn(), placeOrder: vi.fn(), getOrder: vi.fn(),
    };
  });

  const run = () => new SyncProductsUseCase({ yeneshop, products, cache, logger }).execute();

  it('uses YeneShop reseller and suggested retail prices without currency conversion', async () => {
    await run();
    expect(saved[0]?.costPriceETB).toBe('250.00');
    expect(saved[0]?.sellingPrice.toDecimalString()).toBe('340.00');
  });

  it('copies image, delivery mode, and customer-input metadata', async () => {
    await run();
    expect(saved[0]).toMatchObject({
      imageUrl: upstream.imageUrl,
      deliveryType: 'MANUAL',
      input: upstream.input,
    });
  });

  it('preserves Suq-owned fixed price, description, order, and availability', async () => {
    products.findByIds = vi.fn().mockResolvedValue([
      existing({
        priceOverride: Money.fromDecimal('399'),
        descriptionOverride: 'Suq copy',
        operatorAvailable: false,
        sortOrder: 2,
      }),
    ]);
    await run();
    expect(saved[0]?.sellingPrice.toDecimalString()).toBe('399.00');
    expect(saved[0]).toMatchObject({
      descriptionOverride: 'Suq copy', operatorAvailable: false, sortOrder: 2,
    });
  });

  it('deactivates products omitted by YeneShop and refreshes the cache', async () => {
    await run();
    expect(products.deactivateMissing).toHaveBeenCalledWith(['p1']);
    expect(cache.set).toHaveBeenCalled();
  });
});
