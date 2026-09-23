import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Discount } from '../../core/entities/Discount.js';
import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import type {
  DiscountRepository,
  OrderRepository,
  ProductRepository,
} from '../../core/ports/repositories.js';
import { ListProductsUseCase } from './ListProductsUseCase.js';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'p1',
    name: 'Product',
    description: null,
    descriptionOverride: null,
    source: 'YENESHOP',
    deliveryMessage: null,
    input: null,
    stock: 10,
    isActive: true,
    operatorAvailable: true,
    costPriceETB: '10.000000',
    markup: Money.fromDecimal('100'),
    priceOverride: null,
    sellingPrice: Money.fromDecimal('1000'),
    sortOrder: null,
    logoVersion: 0,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd1',
    scope: 'PRODUCT',
    productId: 'p1',
    type: 'PERCENT',
    value: '10',
    label: null,
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListProductsUseCase.priced', () => {
  let products: ProductRepository;
  let discounts: DiscountRepository;
  let orders: OrderRepository;
  let useCase: ListProductsUseCase;

  const names = async () => (await useCase.priced()).map((entry) => entry.product.name);

  beforeEach(() => {
    products = { listActive: vi.fn().mockResolvedValue([]) } as unknown as ProductRepository;
    discounts = { listActive: vi.fn().mockResolvedValue([]) } as unknown as DiscountRepository;
    orders = { soldUnitsSince: vi.fn().mockResolvedValue(new Map()) } as unknown as OrderRepository;
    useCase = new ListProductsUseCase({ products, discounts, orders });
  });

  it('puts discounted products above undiscounted best sellers', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'top', name: 'Best seller' }),
      makeProduct({ id: 'deal', name: 'On offer' }),
    ]);
    vi.mocked(discounts.listActive).mockResolvedValue([makeDiscount({ productId: 'deal' })]);
    vi.mocked(orders.soldUnitsSince).mockResolvedValue(new Map([['top', 500]]));

    expect(await names()).toEqual(['On offer', 'Best seller']);
  });

  it('ranks by units sold within each group', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'slow', name: 'Slow' }),
      makeProduct({ id: 'fast', name: 'Fast' }),
      makeProduct({ id: 'never', name: 'Never' }),
    ]);
    vi.mocked(orders.soldUnitsSince).mockResolvedValue(
      new Map([
        ['slow', 3],
        ['fast', 40],
      ]),
    );

    expect(await names()).toEqual(['Fast', 'Slow', 'Never']);
  });

  it('sinks out-of-stock products below everything, discount or not', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'gone', name: 'Sold out deal', stock: 0 }),
      makeProduct({ id: 'plain', name: 'Available' }),
    ]);
    vi.mocked(discounts.listActive).mockResolvedValue([makeDiscount({ productId: 'gone' })]);

    expect(await names()).toEqual(['Available', 'Sold out deal']);
  });

  it('treats a product disabled by the operator as sold out', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'off', name: 'Unavailable', operatorAvailable: false }),
      makeProduct({ id: 'on', name: 'Available' }),
    ]);

    const result = await useCase.execute();

    expect(result.map((product) => [product.name, product.inStock])).toEqual([
      ['Available', true],
      ['Unavailable', false],
    ]);
  });

  it('puts the operator arrangement above discounts and sales', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'deal', name: 'On offer' }),
      makeProduct({ id: 'top', name: 'Best seller' }),
      makeProduct({ id: 'pinned', name: 'Pinned', sortOrder: 0 }),
    ]);
    vi.mocked(discounts.listActive).mockResolvedValue([makeDiscount({ productId: 'deal' })]);
    vi.mocked(orders.soldUnitsSince).mockResolvedValue(new Map([['top', 500]]));

    expect(await names()).toEqual(['Pinned', 'On offer', 'Best seller']);
  });

  it('keeps the operator arrangement in its own order', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'c', name: 'Third', sortOrder: 2 }),
      makeProduct({ id: 'a', name: 'First', sortOrder: 0 }),
      makeProduct({ id: 'b', name: 'Second', sortOrder: 1 }),
    ]);

    expect(await names()).toEqual(['First', 'Second', 'Third']);
  });

  it('still sinks a placed product that is out of stock', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'pinned', name: 'Pinned but gone', sortOrder: 0, stock: 0 }),
      makeProduct({ id: 'plain', name: 'Available' }),
    ]);

    expect(await names()).toEqual(['Available', 'Pinned but gone']);
  });

  it('falls back to alphabetical order for the never-sold tail', async () => {
    vi.mocked(products.listActive).mockResolvedValue([
      makeProduct({ id: 'c', name: 'Canva' }),
      makeProduct({ id: 'a', name: 'Adobe' }),
      makeProduct({ id: 'b', name: 'Bolt' }),
    ]);

    expect(await names()).toEqual(['Adobe', 'Bolt', 'Canva']);
  });

  it('only counts sales inside the popularity window', async () => {
    await useCase.priced();

    const since = vi.mocked(orders.soldUnitsSince).mock.calls[0]?.[0];
    const days = (Date.now() - (since?.getTime() ?? 0)) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(30, 1);
  });
});
