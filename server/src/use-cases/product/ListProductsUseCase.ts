import { POPULARITY_WINDOW_DAYS } from '../../core/constants.js';
import { priceWithDiscounts, type PricedProduct } from '../../core/entities/Discount.js';
import { isPurchasable, type Product } from '../../core/entities/Product.js';
import type {
  DiscountRepository,
  OrderRepository,
  ProductRepository,
} from '../../core/ports/repositories.js';

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
  /** Units sold in the popularity window; drives the ranking. */
  soldUnits: number;
}

export class ListProductsUseCase {
  constructor(
    private readonly deps: {
      products: ProductRepository;
      discounts: DiscountRepository;
      orders: OrderRepository;
    },
  ) {}

  /**
   * The catalogue with discounts resolved, in display order. Every surface
   * that shows a price goes through this, so the bot and the web app cannot
   * advertise different numbers or a different order — and both match what
   * PlaceOrder will actually charge.
   */
  async priced(): Promise<PricedCatalogueEntry[]> {
    const now = new Date();
    const since = new Date(now.getTime() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [products, discounts, soldUnits] = await Promise.all([
      this.deps.products.listActive(),
      this.deps.discounts.listActive(),
      this.deps.orders.soldUnitsSince(since),
    ]);

    const entries = products.map((product) => ({
      product,
      priced: priceWithDiscounts(product.sellingPrice, product.id, discounts, now),
      soldUnits: soldUnits.get(product.id) ?? 0,
    }));

    return entries.sort(compareForDisplay);
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
      inStock: isPurchasable(product),
    }));
  }
}

/**
 * Display order, most prominent first: in stock, then the operator's own
 * arrangement, then discounted, then the best sellers of the last 30 days,
 * then alphabetically so the list is stable for the long tail of products that
 * have never sold.
 *
 * A hand-picked position beats both automatic signals — the admin dragged it
 * there on purpose — but it does not lift a product above the in-stock ones,
 * because an advertised item the customer cannot buy is the most annoying
 * thing to put at the top of a shop. Products left unplaced keep ranking
 * automatically below the placed ones, so pinning three favourites does not
 * mean hand-sorting the whole catalogue.
 */
function compareForDisplay(a: PricedCatalogueEntry, b: PricedCatalogueEntry): number {
  const outOfStock = (isPurchasable(a.product) ? 0 : 1) - (isPurchasable(b.product) ? 0 : 1);
  if (outOfStock !== 0) return outOfStock;

  const unplaced = (a.product.sortOrder === null ? 1 : 0) - (b.product.sortOrder === null ? 1 : 0);
  if (unplaced !== 0) return unplaced;

  if (a.product.sortOrder !== null && b.product.sortOrder !== null) {
    if (a.product.sortOrder !== b.product.sortOrder) return a.product.sortOrder - b.product.sortOrder;
  }

  const undiscounted = (a.priced.discount ? 0 : 1) - (b.priced.discount ? 0 : 1);
  if (undiscounted !== 0) return undiscounted;

  if (a.soldUnits !== b.soldUnits) return b.soldUnits - a.soldUnits;

  return a.product.name.localeCompare(b.product.name);
}

export function describeDiscount(priced: PricedProduct): string | null {
  if (!priced.discount) return null;
  if (priced.discount.label) return priced.discount.label;

  return priced.discount.type === 'PERCENT'
    ? `${Number(priced.discount.value)}% off`
    : `${priced.discountAmount.format()} off`;
}
