import { describe, expect, it } from 'vitest';

import { Money } from './Money.js';

describe('Money', () => {
  it('parses decimal strings without float drift', () => {
    expect(Money.fromDecimal('0.1').add(Money.fromDecimal('0.2')).toDecimalString()).toBe('0.30');
  });

  it('parses whole numbers and pads the fraction', () => {
    expect(Money.fromDecimal('50').toDecimalString()).toBe('50.00');
    expect(Money.fromDecimal('50.5').toDecimalString()).toBe('50.50');
  });

  it('truncates beyond two decimal places', () => {
    expect(Money.fromDecimal('1.239').toDecimalString()).toBe('1.23');
  });

  it('rejects non-numeric input', () => {
    expect(() => Money.fromDecimal('abc')).toThrow(TypeError);
  });

  it('handles negatives', () => {
    const negative = Money.fromDecimal('-25.50');
    expect(negative.isNegative()).toBe(true);
    expect(negative.toDecimalString()).toBe('-25.50');
  });

  it('multiplies by an exchange rate, rounding half-up', () => {
    // 2.50 USDT at 160 ETB/USDT
    expect(Money.fromDecimal('2.50').multiply('160').toDecimalString()).toBe('400.00');
    expect(Money.fromDecimal('0.01').multiply('160.55').toDecimalString()).toBe('1.61');
  });

  it('compares balances', () => {
    expect(Money.fromDecimal('100').isLessThan(Money.fromDecimal('100.01'))).toBe(true);
    expect(Money.fromDecimal('100').isLessThan(Money.fromDecimal('100'))).toBe(false);
  });

  it('formats with thousands separators', () => {
    expect(Money.fromDecimal('1234567.5').format()).toBe('1,234,567.50 ETB');
    expect(Money.fromDecimal('-1234.5').format()).toBe('-1,234.50 ETB');
  });
});
