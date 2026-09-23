import type { Admin } from '../entities/Admin.js';
import type { Deposit, DepositStatus } from '../entities/Deposit.js';
import type { Discount, DiscountScope, DiscountType } from '../entities/Discount.js';
import type { Feedback } from '../entities/Feedback.js';
import type { DeliveredItem, Order, OrderStatus } from '../entities/Order.js';
import type { Product } from '../entities/Product.js';
import type { User } from '../entities/User.js';
import type { Money } from '../entities/Money.js';

/** Read model for the admin user list: the user plus their order activity. */
export interface UserListEntry {
  user: User;
  orderCount: number;
  totalSpent: Money;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByTelegramId(telegramId: bigint): Promise<User | null>;
  create(data: {
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    avatarUrl?: string | null;
  }): Promise<User>;
  /** Atomic `balance = balance + delta`; rejects if the result would go negative. */
  adjustBalance(
    userId: string,
    delta: Money,
    audit?: { actorTelegramId: bigint; adjustmentId: string },
  ): Promise<User>;
  /** Admin list: newest first, optionally filtered by name, username or id. */
  search(input: { query?: string; limit: number; offset: number }): Promise<{
    entries: UserListEntry[];
    total: number;
  }>;
  setBanned(userId: string, banned: boolean): Promise<User>;
  /** Telegram ids of every user eligible to receive a broadcast (not banned). */
  listBroadcastRecipients(): Promise<bigint[]>;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /** Accepts either the YeneShop product id or human-friendly slug. */
  findBySlugOrId(value: string): Promise<Product | null>;
  listActive(): Promise<Product[]>;
  /** Batch lookup for rendering orders; includes deactivated products. */
  findByIds(ids: string[]): Promise<Product[]>;
  /** Sets or clears the fixed retail price, storing the resulting price. */
  setPriceOverride(productId: string, override: Money | null, sellingPrice: Money): Promise<Product>;
  /** Operator availability switch; separate from YeneShop's availability. */
  setOperatorAvailable(productId: string, available: boolean): Promise<Product>;
  /** Marks the logo as changed so cached copies of the old one are bypassed. */
  bumpLogoVersion(productId: string): Promise<Product>;
  /** Sets or clears the operator-written product page. */
  setDescription(productId: string, details: string | null): Promise<Product>;
  /** Replaces the hand-picked order; ids not listed lose their position. */
  setSortOrder(orderedIds: string[]): Promise<void>;
  /** Drops every hand-picked position, returning the catalogue to ranking. */
  clearSortOrder(): Promise<number>;
  /** Insert-or-update the synced catalogue; returns how many rows changed. */
  upsertMany(products: Product[]): Promise<number>;
  deactivateMissing(seenIds: string[]): Promise<number>;
}

export interface CreateOrderInput {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaid: Money;
  /** What it would have cost without a discount. */
  listPrice: Money;
  discountAmount: Money;
  discountId: string | null;
  costETB: string;
  /** What the buyer answered, when the product asked for something. */
  customerInput: string | null;
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<Order>;
  /**
   * Takes the money and records the order as PAID in a single transaction.
   *
   * This is the only way a customer is ever charged. Doing it in one commit is
   * what makes "charged but no order" impossible: previously the debit and the
   * status write were separate, so a failure between them left a customer out
   * of pocket with nothing owed to them.
   *
   * The conditional balance check inside is also the concurrency lock — two
   * simultaneous purchases cannot overdraw, because the second one finds the
   * balance already spent. Throws InsufficientBalanceError if it cannot cover
   * the price, and nothing is written.
   */
  createPaidOrderAndDebit(input: CreateOrderInput): Promise<{ order: Order; newBalance: Money }>;
  /**
   * Returns the money and marks the order REFUNDED, in one transaction and
   * only while it is still PAID.
   *
   * That guard makes it idempotent: a retry, or a second worker racing the
   * first, finds nothing to refund and credits nobody twice. `refunded` says
   * whether this call was the one that did it.
   */
  refundPaidOrder(orderId: string, reason: string): Promise<{ order: Order; refunded: boolean }>;
  findById(id: string): Promise<Order | null>;
  listByUser(userId: string, limit: number): Promise<Order[]>;
  /**
   * Whether this customer has ever ordered anything. Every row here was
   * charged for — orders are written as PAID — so one is enough to say they
   * have bought from us, whatever became of it afterwards. A refund or a
   * failed delivery is still an experience worth asking them to rate.
   */
  hasAnyOrder(userId: string): Promise<boolean>;
  markCompleted(
    id: string,
    yeneshopOrderId: string | null,
    items: DeliveredItem[],
    actorTelegramId?: bigint,
  ): Promise<Order>;
  /** Records that YeneShop accepted the order but will deliver it later. */
  markAwaitingUpstream(id: string, yeneshopOrderId: string): Promise<Order>;
  /**
   * Units sold per product since `since`, counting only orders that actually
   * completed — a failed or refunded order is not evidence of demand. Products
   * with no sales in the window are absent from the map.
   */
  soldUnitsSince(since: Date): Promise<Map<string, number>>;
  markStatus(id: string, status: OrderStatus, failureReason?: string): Promise<Order>;
  /** YeneShop-backed orders accepted upstream but not delivered locally yet. */
  listAwaitingYeneShop(limit: number): Promise<Order[]>;
}

export interface DepositRepository {
  create(data: { userId: string; amount: Money; screenshotUrl: string }): Promise<Deposit>;
  findById(id: string): Promise<Deposit | null>;
  listByStatus(status: DepositStatus, limit: number): Promise<Deposit[]>;
  listByUser(userId: string, limit: number): Promise<Deposit[]>;
  /**
   * Approves the deposit and credits the wallet in a single transaction, and
   * only if the deposit is still PENDING — this is what stops a double-tap on
   * the admin's Approve button from crediting twice.
   */
  approveAndCredit(depositId: string, reviewerTelegramId: bigint): Promise<{ deposit: Deposit; user: User }>;
  reject(depositId: string, reviewerTelegramId: bigint, note: string | null): Promise<Deposit>;
}

export interface ConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface AdminRepository {
  /** The only authorisation question the system asks. */
  isAdmin(telegramId: bigint): Promise<boolean>;
  list(): Promise<Admin[]>;
  count(): Promise<number>;
  add(telegramId: bigint, addedByTelegramId: bigint | null, note: string | null): Promise<Admin>;
  remove(telegramId: bigint): Promise<boolean>;
}

/** Read model for the panel's feedback tab: the rating plus who left it. */
export interface FeedbackListEntry {
  feedback: Feedback;
  user: User;
}

export interface FeedbackRepository {
  /** One rating per user; answering again replaces the previous one. */
  upsert(userId: string, rating: number): Promise<Feedback>;
  findByUserId(userId: string): Promise<Feedback | null>;
  /** Newest first, with the rater attached. */
  list(input: { limit: number; offset: number }): Promise<{
    entries: FeedbackListEntry[];
    total: number;
    /** Mean rating across every row, or null when nobody has rated yet. */
    average: number | null;
  }>;
}

export interface DiscountRepository {
  /** Switched-on discounts; the date window is evaluated in the domain. */
  listActive(): Promise<Discount[]>;
  listAll(): Promise<Discount[]>;
  findById(id: string): Promise<Discount | null>;
  create(input: {
    scope: DiscountScope;
    productId: string | null;
    type: DiscountType;
    value: string;
    label: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    createdByTelegramId: bigint | null;
  }): Promise<Discount>;
  setActive(id: string, isActive: boolean): Promise<Discount>;
  remove(id: string): Promise<boolean>;
}
