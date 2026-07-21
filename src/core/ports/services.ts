import type { DeliveredItem } from '../entities/Order.js';

export interface HubxProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stock: number;
  isActive: boolean;
  priceUSDT: string;
}

export interface HubxOrderResult {
  hubxOrderId: string | null;
  deliveredItems: DeliveredItem[];
  /** HubX returned a previous delivery for this external_order_id — no new charge. */
  idempotentReplay: boolean;
}

export interface HubxGateway {
  getProducts(): Promise<HubxProduct[]>;
  getProduct(idOrSlug: string): Promise<HubxProduct | null>;
  getResellerBalanceUSDT(): Promise<string>;
  /** `externalOrderId` makes retries idempotent on HubX's side. */
  placeOrder(input: {
    productId: string;
    quantity: number;
    externalOrderId: string;
  }): Promise<HubxOrderResult>;
  /** Re-fetches a delivery, for recovering items lost to a failed send. */
  getOrder(hubxOrderId: string): Promise<HubxOrderResult | null>;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Lets use-cases notify operators without knowing anything about Telegram. */
export interface AdminNotifier {
  alert(message: string): Promise<void>;
}
