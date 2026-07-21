import type { Deposit } from '../../core/entities/Deposit.js';
import type { Money } from '../../core/entities/Money.js';
import type { Order } from '../../core/entities/Order.js';
import { isPurchasable, productDetails, type Product } from '../../core/entities/Product.js';
import type { User } from '../../core/entities/User.js';

/**
 * Domain objects never leave the process as-is. Two hazards handled here:
 * `JSON.stringify` throws on BigInt, and Money is a class the client cannot
 * reconstruct — both are converted to strings at this boundary.
 *
 * Every monetary value is sent twice: a machine-readable decimal string and a
 * display label, so the client never has to reimplement formatting.
 */

export interface MoneyDto {
  amount: string;
  label: string;
}

function money(value: Money): MoneyDto {
  return { amount: value.toDecimalString(), label: value.format() };
}

export interface UserDto {
  id: string;
  telegramId: string;
  firstName: string | null;
  username: string | null;
  balance: MoneyDto;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    firstName: user.firstName,
    username: user.username,
    balance: money(user.balance),
  };
}

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  details: string | null;
  stock: number;
  inStock: boolean;
  price: MoneyDto;
  logoUrl: string;
}

export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    details: productDetails(product),
    stock: product.stock,
    inStock: isPurchasable(product),
    price: money(product.sellingPrice),
    // Logos are named by slug, so no lookup table is needed on the client.
    logoUrl: `/logos/${product.slug}.webp`,
  };
}

export interface OrderDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaid: MoneyDto;
  status: Order['status'];
  /** Only ever returned to the order's owner. */
  deliveredItems: unknown[] | null;
  createdAt: string;
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    productId: order.productId,
    productName: order.productName,
    quantity: order.quantity,
    pricePaid: money(order.pricePaid),
    status: order.status,
    deliveredItems: order.deliveredItems,
    createdAt: order.createdAt.toISOString(),
  };
}

export interface DepositDto {
  id: string;
  amount: MoneyDto;
  status: Deposit['status'];
  createdAt: string;
  reviewedAt: string | null;
}

export function toDepositDto(deposit: Deposit): DepositDto {
  return {
    id: deposit.id,
    amount: money(deposit.amount),
    status: deposit.status,
    createdAt: deposit.createdAt.toISOString(),
    reviewedAt: deposit.reviewedAt?.toISOString() ?? null,
    // screenshotUrl is deliberately omitted: it is a Telegram file_id that
    // only the bot token can resolve, and the customer has no use for it.
  };
}
