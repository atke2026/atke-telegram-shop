import { priceWithDiscounts, type PricedProduct } from '../../core/entities/Discount.js';
import type { Product } from '../../core/entities/Product.js';
import type { DiscountRepository, ProductRepository } from '../../core/ports/repositories.js';

/** Read model for the catalogue keyboard. */
export interface ProductListItem {
  id: string;
  name: string;
  stock: number;
  /** What the customer pays, discount already applied. */
  priceLabel: string;
  /** The crossed-out price, present only when a discount applied. */
  originalPriceLabel: string | null;
  discountLabel: string | null;
  inStock: boolean;
}

export interface PricedCatalogueEntry {
  product: Product;
  priced: PricedProduct;
}

export class ListProductsUseCase {
  constructor(
    private readonly deps: { products: ProductRepository; discounts: DiscountRepository },
  ) {}

  /**
   * The catalogue with discounts resolved. Every surface that shows a price
   * goes through this, so the bot and the web app cannot advertise different
   * numbers — and both match what PlaceOrder will actually charge.
   */
  async priced(): Promise<PricedCatalogueEntry[]> {
    const [products, discounts] = await Promise.all([
      this.deps.products.listActive(),
      this.deps.discounts.listActive(),
    ]);

    const now = new Date();
    return products.map((product) => ({
      product,
      priced: priceWithDiscounts(product.sellingPrice, product.id, discounts, now),
    }));
  }

  async execute(): Promise<ProductListItem[]> {
    const entries = await this.priced();

    return entries.map(({ product, priced }) => ({
      id: product.id,
      name: product.name,
      stock: product.stock,
      priceLabel: priced.finalPrice.format(),
      originalPriceLabel: priced.discount ? priced.listPrice.format() : null,
      discountLabel: priced.discount ? describeDiscount(priced) : null,
      inStock: product.stock > 0,
    }));
  }
}

export function describeDiscount(priced: PricedProduct): string | null {
  if (!priced.discount) return null;
  if (priced.discount.label) return priced.discount.label;

  return priced.discount.type === 'PERCENT'
    ? `${Number(priced.discount.value)}% off`
    : `${priced.discountAmount.format()} off`;
}
