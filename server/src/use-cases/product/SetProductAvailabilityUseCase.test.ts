import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort } from '../../core/ports/services.js';
import {
  NotAYeneShopProductError,
  SetProductAvailabilityUseCase,
} from './SetProductAvailabilityUseCase.js';

function product(source: Product['source'] = 'YENESHOP'): Product {
  return {
    id: 'p1',
    slug: 'product',
    name: 'Product',
    description: null,
    descriptionOverride: null,
    source,
    deliveryMessage: source === 'MANUAL' ? 'delivery' : null,
    input: null,
    stock: 5,
    isActive: true,
    operatorAvailable: true,
    costPriceETB: '1',
    markup: Money.ZERO,
    priceOverride: null,
    sellingPrice: Money.fromDecimal('100'),
    sortOrder: null,
    logoVersion: 0,
    updatedAt: new Date(),
  };
}

describe('SetProductAvailabilityUseCase', () => {
  let products: ProductRepository;
  let cache: CachePort;
  let useCase: SetProductAvailabilityUseCase;

  beforeEach(() => {
    products = {
      findBySlugOrId: vi.fn().mockResolvedValue(product()),
      setOperatorAvailable: vi.fn().mockImplementation(async (_id, available) => ({
        ...product(),
        operatorAvailable: available,
      })),
    } as unknown as ProductRepository;
    cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
    useCase = new SetProductAvailabilityUseCase({ products, cache });
  });

  it('marks a YeneShop product unavailable and clears the catalogue cache', async () => {
    const updated = await useCase.execute({ slugOrId: 'product', available: false });

    expect(products.setOperatorAvailable).toHaveBeenCalledWith('p1', false);
    expect(updated.operatorAvailable).toBe(false);
    expect(cache.del).toHaveBeenCalled();
  });

  it('can make the product available again', async () => {
    vi.mocked(products.findBySlugOrId).mockResolvedValue(
      product('YENESHOP'),
    );

    const updated = await useCase.execute({ slugOrId: 'product', available: true });

    expect(updated.operatorAvailable).toBe(true);
  });

  it('does not apply the YeneShop switch to own products', async () => {
    vi.mocked(products.findBySlugOrId).mockResolvedValue(product('MANUAL'));

    await expect(
      useCase.execute({ slugOrId: 'product', available: false }),
    ).rejects.toBeInstanceOf(NotAYeneShopProductError);
    expect(products.setOperatorAvailable).not.toHaveBeenCalled();
  });
});
