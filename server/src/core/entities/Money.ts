/**
 * Money is stored as integer minor units (cents/santim) to keep arithmetic exact.
 * Floats are never used for balances anywhere in the system.
 */
export class Money {
  private constructor(readonly cents: bigint) {}

  static readonly ZERO = new Money(0n);

  static fromCents(cents: bigint | number): Money {
    return new Money(BigInt(cents));
  }

  /** Accepts "1234.56", 1234.56 or a Prisma Decimal (via toString). */
  static fromDecimal(value: string | number | { toString(): string }): Money {
    const raw = typeof value === 'string' ? value : value.toString();
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw.trim());

    if (!match) {
      throw new TypeError(`Cannot parse "${raw}" as a monetary amount`);
    }

    const [, sign, whole = '0', fraction = ''] = match;
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));

    return new Money(sign === '-' ? -cents : cents);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  /** Multiplies by a decimal factor, rounding half-up to the nearest cent. */
  multiply(factor: string | number): Money {
    const scaled = Money.fromDecimal(factor);
    const product = this.cents * scaled.cents;
    const rounded = (product < 0n ? product - 50n : product + 50n) / 100n;

    return new Money(rounded);
  }

  /**
   * A percentage of this amount, rounded half-up to the nearest cent.
   *
   * Not expressible with `multiply`: converting 12.5% to a factor gives 0.875,
   * which that method truncates to 0.87. Here the percentage keeps its own two
   * decimal places and the division happens once, at the end.
   */
  percentage(percent: string | number): Money {
    const scaled = Money.fromDecimal(percent).cents; // 12.50% -> 1250n
    const product = this.cents * scaled;
    const rounded = (product < 0n ? product - 5000n : product + 5000n) / 10000n;

    return new Money(rounded);
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  /** "1234.56" — the canonical form for persistence. */
  toDecimalString(): string {
    const negative = this.cents < 0n;
    const abs = negative ? -this.cents : this.cents;
    const whole = abs / 100n;
    const fraction = (abs % 100n).toString().padStart(2, '0');

    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  /** "1,234.56 ETB" — for display to users. */
  format(currency = 'ETB'): string {
    const [whole = '0', fraction = '00'] = this.toDecimalString().split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return `${grouped}.${fraction} ${currency}`;
  }
}
