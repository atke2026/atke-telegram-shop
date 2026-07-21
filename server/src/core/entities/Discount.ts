import { Money } from './Money.js';

export type DiscountScope = 'ALL' | 'PRODUCT';
export type DiscountType = 'PERCENT' | 'FIXED';

export interface Discount {
  id: string;
  scope: DiscountScope;
  /** Set when scope is PRODUCT. */
  productId: string | null;
  type: DiscountType;
  /** A percentage (0–100) when type is PERCENT, otherwise an ETB amount. */
  value: string;
  label: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
}

export interface PricedProduct {
  /** What the product costs before any discount. */
  listPrice: Money;
  /** What the customer actually pays. */
  finalPrice: Money;
  /** listPrice − finalPrice; zero when nothing applied. */
  discountAmount: Money;
  discount: Discount | null;
}

export function isDiscountLive(discount: Discount, now: Date): boolean {
  if (!discount.isActive) return false;
  if (discount.startsAt && now < discount.startsAt) return false;
  if (discount.endsAt && now > discount.endsAt) return false;

  return true;
}

/**
 * What a discount takes off a price.
 *
 * Never more than the price itself: a fixed 5,000 ETB off a 2,000 ETB product
 * makes it free, not negative, and a percentage above 100 is treated as 100.
 */
export function discountAmountFor(listPrice: Money, discount: Discount): Money {
  if (listPrice.isZero() || listPrice.isNegative()) return Money.ZERO;

  const raw =
    discount.type === 'PERCENT'
      ? listPrice.percentage(clampPercent(discount.value))
      : Money.fromDecimal(discount.value);

  if (raw.isNegative()) return Money.ZERO;

  return raw.isGreaterThan(listPrice) ? listPrice : raw;
}

function clampPercent(value: string): string {
  const percent = Money.fromDecimal(value);
  if (percent.isNegative()) return '0';

  return percent.isGreaterThan(Money.fromDecimal('100')) ? '100' : value;
}

/**
 * Chooses the single best discount for a product. They never stack — applying
 * a store-wide percentage on top of a per-product amount is how a price ends
 * up under what the stock cost.
 */
export function priceWithDiscounts(
  listPrice: Money,
  productId: string,
  discounts: Discount[],
  now: Date = new Date(),
): PricedProduct {
  const applicable = discounts.filter(
    (discount) =>
      isDiscountLive(discount, now) &&
      (discount.scope === 'ALL' || discount.productId === productId),
  );

  let best: { discount: Discount; amount: Money } | null = null;
  for (const discount of applicable) {
    const amount = discountAmountFor(listPrice, discount);
    if (amount.isZero()) continue;
    if (!best || amount.isGreaterThan(best.amount)) best = { discount, amount };
  }

  if (!best) {
    return {
      listPrice,
      finalPrice: listPrice,
      discountAmount: Money.ZERO,
      discount: null,
    };
  }

  return {
    listPrice,
    finalPrice: listPrice.subtract(best.amount),
    discountAmount: best.amount,
    discount: best.discount,
  };
}
