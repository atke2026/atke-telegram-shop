import { Money } from './Money.js';

export type OrderStatus = 'PENDING' | 'PAID' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

/**
 * Whatever YeneShop hands over. Today these are usually plain strings — an activation
 * link or `user:pass` — but an object is accepted too, so a future payload
 * shape cannot break parsing.
 */
export type DeliveredItem = string | Record<string, unknown>;

export interface Order {
  /** Sent as `externalId` to YeneShop, which makes retries idempotent. */
  id: string;
  userId: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaid: Money;
  costETB: string;
  status: OrderStatus;
  yeneshopOrderId: string | null;
  deliveredItems: DeliveredItem[] | null;
  failureReason: string | null;
  /** What the buyer typed when the product asked them for something. */
  customerInput: string | null;
  createdAt: Date;
}
