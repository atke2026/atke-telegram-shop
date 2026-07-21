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

export interface NewDepositNotification {
  depositId: string;
  amountLabel: string;
  user: { telegramId: bigint; firstName: string | null; username: string | null };
  /** A file_id when the receipt arrived via the bot, raw bytes when uploaded from the web app. */
  photo: { fileId: string } | { buffer: Buffer };
}

/**
 * Puts a deposit in front of the admins with approve/reject controls. Shared by
 * the bot and the web API so the review flow cannot drift between them.
 */
export interface DepositNotifier {
  notifyNewDeposit(notification: NewDepositNotification): Promise<void>;
  /** Tells the customer their deposit was reviewed. */
  notifyDepositReviewed(input: {
    telegramId: bigint;
    approved: boolean;
    amountLabel: string;
    newBalanceLabel?: string;
  }): Promise<void>;
}
