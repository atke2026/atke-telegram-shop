import type { DeliveredItem } from '../entities/Order.js';

export interface YeneShopProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string;
  stock: number;
  isActive: boolean;
  resellerPriceETB: string;
  suggestedRetailPriceETB: string;
  deliveryType: 'INSTANT' | 'MANUAL';
  input: {
    type: 'TEXT' | 'NUMBER';
    placeholder: string | null;
  } | null;
}

export interface YeneShopOrderResult {
  yeneshopOrderId: string;
  externalId: string;
  deliveredItems: DeliveredItem[];
  status: 'PENDING' | 'PAID' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  awaitingDelivery: boolean;
  instructions: string | null;
}

export interface YeneShopGateway {
  getProducts(): Promise<YeneShopProduct[]>;
  getResellerBalanceETB(): Promise<string>;
  /** `externalOrderId` is Suq's local order id and is idempotent in YeneShop. */
  placeOrder(input: {
    productId: string;
    externalOrderId: string;
    customerInput: string | null;
  }): Promise<YeneShopOrderResult>;
  /** Re-fetches by Suq's external id, including delayed manual delivery. */
  getOrder(externalOrderId: string): Promise<YeneShopOrderResult | null>;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Reads the product artwork shared by the storefront and Telegram posts. */
export interface ProductImageReader {
  read(slug: string): Promise<Buffer | null>;
}

/** Lets use-cases notify operators without knowing anything about Telegram. */
export interface AdminNotifier {
  alert(message: string): Promise<void>;
}

/** Delivers a completed archive to the current shop administrators. */
export interface BackupNotifier {
  notifyBackup(input: {
    archivePath: string;
    name: string;
    kind: 'automatic' | 'manual';
    createdAt: string;
    sizeBytes: number;
    warnings: string[];
  }): Promise<void>;
}

/** A customer-facing catalogue announcement sent by the shop bot. */
export interface NewArrivalNotification {
  productId: string;
  productSlug: string;
  productName: string;
  image: Buffer;
  /** The amount customers will actually pay, after any live discount. */
  priceLabel: string;
  /** Present when a discount makes the normal price worth showing too. */
  listPriceLabel?: string;
  discountLabel?: string;
  /** Do not echo a mass announcement back to the admin who sent it. */
  excludeTelegramId?: bigint;
}

export interface NewArrivalNotifier {
  notifyNewArrival(
    notification: NewArrivalNotification,
  ): Promise<{ delivered: number; failed: number }>;
}

export type ProductChannelPost =
  | {
      kind: 'NEW_ARRIVAL';
      productSlug: string;
      productName: string;
      image: Buffer;
      priceLabel: string;
      listPriceLabel?: string;
      discountLabel?: string;
    }
  | {
      kind: 'LOW_STOCK';
      productSlug: string;
      productName: string;
      image: Buffer;
      stock: number;
    };

/** Publishes one product card to the shop's public Telegram channel. */
export interface ProductChannelPublisher {
  publishProduct(post: ProductChannelPost): Promise<{ messageId: number }>;
}

export interface NewDepositNotification {
  depositId: string;
  amountLabel: string;
  user: { telegramId: bigint; firstName: string | null; username: string | null };
  /** A file_id when the receipt arrived via the bot, raw bytes when uploaded from the web app. */
  photo: { fileId: string } | { buffer: Buffer };
}

/**
 * Reaches the customer about an order they are already waiting on. Used by the
 * delivery screen: the operator types the item into the web app, but the
 * person who bought it is in the chat, so that is where it has to arrive.
 */
export interface OrderNotifier {
  notifyOrderDelivered(input: {
    telegramId: bigint;
    productName: string;
    items: DeliveredItem[];
    /** The product page, sent after the item as redemption steps. */
    instructions: string | null;
  }): Promise<void>;
  /**
   * Tells the buyer an order they paid for will not be delivered.
   *
   * `refundedLabel` is the money put back on their wallet, or null when the
   * order was cancelled without one — the difference is the whole point of
   * the message, so it is never left implicit.
   */
  notifyOrderCancelled(input: {
    telegramId: bigint;
    productName: string;
    refundedLabel: string | null;
    newBalanceLabel: string | null;
    /** Why, in the operator's words. Null when they gave no reason. */
    reason: string | null;
  }): Promise<void>;
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
