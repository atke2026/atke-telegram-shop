import { Money } from './Money.js';

export type OrderStatus = 'PENDING' | 'PAID' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface DeliveredItem {
  [key: string]: unknown;
}

export interface Order {
  /** Doubles as the `external_order_id` sent to HubX, which makes retries idempotent. */
  id: string;
  userId: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaid: Money;
  costUSDT: string;
  status: OrderStatus;
  hubxOrderId: string | null;
  deliveredItems: DeliveredItem[] | null;
  failureReason: string | null;
  createdAt: Date;
}
