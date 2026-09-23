import type { ProductDto } from '../api/productApi';

/**
 * The reseller's sandbox (and some vendors) report "unlimited" stock, which the
 * server maps to a sentinel near Number.MAX_SAFE_INTEGER. Any implausibly large
 * count is shown as a plain "In stock" rather than a sixteen-digit number.
 */
const UNLIMITED_STOCK_THRESHOLD = 1_000_000;

export function stockLabel(product: Pick<ProductDto, 'stock' | 'inStock'>): string {
  if (!product.inStock) return 'Out of stock';
  if (product.stock >= UNLIMITED_STOCK_THRESHOLD) return 'In stock';
  return `${product.stock} in stock`;
}
