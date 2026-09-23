import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import { ProductNotFoundError } from '../../core/errors/DomainError.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort } from '../../core/ports/services.js';
import { ReorderProductsUseCase } from './ReorderProductsUseCase.js';

function makeProduct(id: string): Product {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    descriptionOverride: null,
    source: 'YENESHOP',
    deliveryMessage: null,
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

describe('ReorderProductsUseCase', () => {
  let products: ProductRepository;
  let cache: CachePort;
  let useCase: ReorderProductsUseCase;

  beforeEach(() => {
    products = {
      listActive: vi.fn().mockResolvedValue([makeProduct('a'), makeProduct('b'), makeProduct('c')]),
      bumpLogoVersion: vi.fn(),
      setSortOrder: vi.fn(),
      clearSortOrder: vi.fn().mockResolvedValue(3),
    } as unknown as ProductRepository;
    cache = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
    useCase = new ReorderProductsUseCase({ products, cache });
  });

  it('stores the arrangement as given', async () => {
    const result = await useCase.execute(['c', 'a']);

    expect(products.setSortOrder).toHaveBeenCalledWith(['c', 'a']);
    expect(result.placed).toBe(2);
  });

  it('rejects an id that is not in the live catalogue', async () => {
    await expect(useCase.execute(['a', 'ghost'])).rejects.toThrow(ProductNotFoundError);
    expect(products.setSortOrder).not.toHaveBeenCalled();
  });

  it('drops repeats without disturbing the order', async () => {
    await useCase.execute(['b', 'a', 'b']);

    expect(products.setSortOrder).toHaveBeenCalledWith(['b', 'a']);
  });

  it('drops the catalogue cache so the storefront sees the new order', async () => {
    await useCase.execute(['a']);
    expect(cache.del).toHaveBeenCalled();

    vi.mocked(cache.del).mockClear();
    await useCase.reset();
    expect(cache.del).toHaveBeenCalled();
  });

  it('reports how many positions a reset cleared', async () => {
    expect(await useCase.reset()).toEqual({ cleared: 3 });
    expect(products.clearSortOrder).toHaveBeenCalled();
  });
});
