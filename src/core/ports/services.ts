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
}

export interface HubxGateway {
  getProducts(): Promise<HubxProduct[]>;
  getResellerBalanceUSDT(): Promise<string>;
  /** `externalOrderId` makes retries idempotent on HubX's side. */
  placeOrder(input: {
    productId: string;
    quantity: number;
    externalOrderId: string;
  }): Promise<HubxOrderResult>;
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
