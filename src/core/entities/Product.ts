import { Money } from './Money.js';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stock: number;
  isActive: boolean;
  /** Upstream HubX cost, quoted in USDT. */
  costPriceUSDT: string;
  markup: Money;
  /** Operator-set retail price; overrides the computed one when present. */
  priceOverride: Money | null;
  sellingPrice: Money;
  updatedAt: Date;
}

export function isPurchasable(product: Product): boolean {
  return product.isActive && product.stock > 0;
}

/**
 * (HubX USDT cost * rate) + admin ETB markup = final customer price.
 */
export function calculateSellingPrice(costUSDT: string, usdtEtbRate: string, markup: Money): Money {
  return Money.fromDecimal(costUSDT).multiply(usdtEtbRate).add(markup);
}

/** A fixed retail price wins over the computed one, and ignores rate moves. */
export function resolveSellingPrice(
  costUSDT: string,
  usdtEtbRate: string,
  markup: Money,
  priceOverride: Money | null,
): Money {
  return priceOverride ?? calculateSellingPrice(costUSDT, usdtEtbRate, markup);
}
