import { UNLIMITED_STOCK } from '../constants.js';
import { Money } from './Money.js';

/**
 * How an order for the product is fulfilled. `YENESHOP` products are bought
 * through YeneShop's private reseller API; `MANUAL` ones are legacy local
 * operator and are delivered from `deliveryMessage`, with no upstream call, no
 * cost and no stock to run out of.
 */
export type ProductSource = 'YENESHOP' | 'MANUAL';

/** The kind of answer a product asks its buyer for. */
export type ProductInputType = 'TEXT' | 'NUMBER';

/** What the buyer is asked for before they can pay. */
export interface CustomerInputField {
  type: ProductInputType;
  /** Shown in the empty box, e.g. "Your phone number". */
  placeholder: string | null;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Operator-written details; shown instead of the upstream description. */
  descriptionOverride: string | null;
  source: ProductSource;
  /** Absolute image URL supplied by YeneShop; null only on legacy local rows. */
  imageUrl?: string | null;
  /** YeneShop can accept an order instantly but deliver it later by hand. */
  deliveryType?: 'INSTANT' | 'MANUAL';
  /** What a legacy local product hands the buyer; null on YeneShop products. */
  deliveryMessage: string | null;
  /**
   * Something the operator needs from the buyer to fulfil the order — the
   * number to top up, the account to invite. Null when the product asks for
   * nothing.
   */
  input: CustomerInputField | null;
  stock: number;
  isActive: boolean;
  /** Operator switch preserved across YeneShop catalogue refreshes. */
  operatorAvailable: boolean;
  /** Price charged to Suq by YeneShop, quoted in ETB. */
  costPriceETB: string;
  /** YeneShop's current customer-facing price, used when no override exists. */
  suggestedRetailPrice?: Money;
  markup: Money;
  /** Operator-set retail price; overrides the computed one when present. */
  priceOverride: Money | null;
  sellingPrice: Money;
  /** Hand-picked catalogue position; null means the ranking decides. */
  sortOrder: number | null;
  /** Incremented on every logo upload; rides on the image URL to bust caches. */
  logoVersion: number;
  updatedAt: Date;
}

export function isManual(product: Product): boolean {
  return product.source === 'MANUAL';
}

/**
 * How a manual product reaches the buyer. With a message stored on it the
 * delivery is instant and identical every time; without one, each purchase
 * waits in the operator's queue to be filled in by hand — which is what a
 * product like an account, unique per customer, needs.
 */
export function deliversByHand(product: Product): boolean {
  return product.deliveryType === 'MANUAL' || (isManual(product) && !product.deliveryMessage);
}

/** A manual product has no stock to count, so only being listed stops it. */
export function isPurchasable(product: Product): boolean {
  if (!product.isActive || !product.operatorAvailable) return false;
  if (isManual(product)) return true;

  return product.stock > 0;
}

/**
 * Checks what the buyer typed against what the product asked for.
 *
 * Returns the value to store, trimmed, or an error message written for the
 * customer. A product that asks for nothing accepts nothing: anything sent
 * alongside it is dropped rather than quietly recorded, so an order can never
 * carry an answer to a question it never posed.
 */
export function validateCustomerInput(
  product: Product,
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (!product.input) return { ok: true, value: null };

  const value = (raw ?? '').trim();
  const asked = product.input.placeholder?.trim() || 'the requested details';

  if (value.length === 0) return { ok: false, reason: `Please enter ${asked.toLowerCase()}.` };
  if (value.length > MAX_INPUT_LENGTH) {
    return { ok: false, reason: `That is too long — keep it under ${MAX_INPUT_LENGTH} characters.` };
  }

  // Deliberately permissive: digits, spaces and the punctuation a phone number
  // carries. Rejecting "+251 91 234 5678" for containing a plus would be worse
  // than accepting a slightly odd number.
  if (product.input.type === 'NUMBER' && !/^[\d+\-()\s]+$/.test(value)) {
    return { ok: false, reason: 'Please enter numbers only.' };
  }

  return { ok: true, value };
}

/** Long enough for an email or a note, short enough not to be a payload. */
const MAX_INPUT_LENGTH = 200;

/** True for a product whose count is the "unlimited" sentinel, not a real one. */
export function hasUnlimitedStock(product: Product): boolean {
  return product.stock >= UNLIMITED_STOCK;
}

export function productDetails(product: Product): string | null {
  return product.descriptionOverride ?? product.description;
}

/**
 * YeneShop reseller cost + Suq's ETB markup = final customer price.
 */
export function calculateSellingPrice(costETB: string, markup: Money): Money {
  return Money.fromDecimal(costETB).add(markup);
}

/** A fixed retail price wins over YeneShop's suggested retail price. */
export function resolveSellingPrice(
  suggestedRetailPrice: Money,
  priceOverride: Money | null,
): Money {
  return priceOverride ?? suggestedRetailPrice;
}
