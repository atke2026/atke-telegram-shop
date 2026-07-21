import { describe, expect, it } from 'vitest';

import {
  discountAmountFor,
  isDiscountLive,
  priceWithDiscounts,
  type Discount,
} from './Discount.js';
import { Money } from './Money.js';

function makeDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd1',
    scope: 'ALL',
    productId: null,
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

const PRICE = Money.fromDecimal('3900');

describe('discountAmountFor', () => {
  it('takes a percentage off', () => {
    expect(discountAmountFor(PRICE, makeDiscount({ value: '10' })).toDecimalString()).toBe('390.00');
  });

  it('handles fractional percentages exactly', () => {
    // 12.5% of 3900 is 487.50 — a factor-based implementation truncates to 487.
    expect(discountAmountFor(PRICE, makeDiscount({ value: '12.5' })).toDecimalString()).toBe(
      '487.50',
    );
  });

  it('takes a fixed amount off', () => {
    const discount = makeDiscount({ type: 'FIXED', value: '1000' });
    expect(discountAmountFor(PRICE, discount).toDecimalString()).toBe('1000.00');
  });

  it('never discounts more than the price', () => {
    const discount = makeDiscount({ type: 'FIXED', value: '99999' });
    expect(discountAmountFor(PRICE, discount).toDecimalString()).toBe('3900.00');
  });

  it('clamps a percentage above 100', () => {
    const discount = makeDiscount({ value: '150' });
    expect(discountAmountFor(PRICE, discount).toDecimalString()).toBe('3900.00');
  });

  it('ignores a negative value', () => {
    const discount = makeDiscount({ type: 'FIXED', value: '-500' });
    expect(discountAmountFor(PRICE, discount).toDecimalString()).toBe('0.00');
  });
});

describe('isDiscountLive', () => {
  const now = new Date('2026-07-21T12:00:00Z');

  it('ignores an inactive discount', () => {
    expect(isDiscountLive(makeDiscount({ isActive: false }), now)).toBe(false);
  });

  it('ignores one that has not started', () => {
    const discount = makeDiscount({ startsAt: new Date('2026-08-01T00:00:00Z') });
    expect(isDiscountLive(discount, now)).toBe(false);
  });

  it('ignores one that has expired', () => {
    const discount = makeDiscount({ endsAt: new Date('2026-07-20T00:00:00Z') });
    expect(isDiscountLive(discount, now)).toBe(false);
  });

  it('accepts one inside its window', () => {
    const discount = makeDiscount({
      startsAt: new Date('2026-07-01T00:00:00Z'),
      endsAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(isDiscountLive(discount, now)).toBe(true);
  });

  it('accepts an open-ended discount', () => {
    expect(isDiscountLive(makeDiscount(), now)).toBe(true);
  });
});

describe('priceWithDiscounts', () => {
  const now = new Date('2026-07-21T12:00:00Z');

  it('returns the list price when nothing applies', () => {
    const result = priceWithDiscounts(PRICE, 'p1', [], now);

    expect(result.finalPrice.toDecimalString()).toBe('3900.00');
    expect(result.discount).toBeNull();
  });

  it('applies a store-wide discount to any product', () => {
    const result = priceWithDiscounts(PRICE, 'p1', [makeDiscount({ value: '10' })], now);

    expect(result.finalPrice.toDecimalString()).toBe('3510.00');
  });

  it('ignores a discount aimed at a different product', () => {
    const other = makeDiscount({ scope: 'PRODUCT', productId: 'p2', type: 'FIXED', value: '1000' });
    const result = priceWithDiscounts(PRICE, 'p1', [other], now);

    expect(result.finalPrice.toDecimalString()).toBe('3900.00');
  });

  it('picks the better of two rather than stacking them', () => {
    const storeWide = makeDiscount({ id: 'store', value: '10' }); // 390 off
    const perProduct = makeDiscount({
      id: 'product',
      scope: 'PRODUCT',
      productId: 'p1',
      type: 'FIXED',
      value: '1000',
    });

    const result = priceWithDiscounts(PRICE, 'p1', [storeWide, perProduct], now);

    // Stacking would give 2,510; the better single discount gives 2,900.
    expect(result.finalPrice.toDecimalString()).toBe('2900.00');
    expect(result.discount?.id).toBe('product');
  });

  it('keeps the store-wide one when it is worth more', () => {
    const storeWide = makeDiscount({ id: 'store', value: '50' }); // 1950 off
    const perProduct = makeDiscount({
      id: 'product',
      scope: 'PRODUCT',
      productId: 'p1',
      type: 'FIXED',
      value: '100',
    });

    const result = priceWithDiscounts(PRICE, 'p1', [storeWide, perProduct], now);

    expect(result.discount?.id).toBe('store');
    expect(result.finalPrice.toDecimalString()).toBe('1950.00');
  });

  it('skips expired discounts when choosing', () => {
    const expired = makeDiscount({ id: 'old', value: '50', endsAt: new Date('2026-07-01') });
    const live = makeDiscount({ id: 'live', value: '10' });

    const result = priceWithDiscounts(PRICE, 'p1', [expired, live], now);

    expect(result.discount?.id).toBe('live');
  });

  it('never produces a negative price', () => {
    const huge = makeDiscount({ type: 'FIXED', value: '999999' });
    const result = priceWithDiscounts(PRICE, 'p1', [huge], now);

    expect(result.finalPrice.toDecimalString()).toBe('0.00');
    expect(result.finalPrice.isNegative()).toBe(false);
  });
});
