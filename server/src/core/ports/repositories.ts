import type { Admin } from '../entities/Admin.js';
import type { Deposit, DepositStatus } from '../entities/Deposit.js';
import type { Discount, DiscountScope, DiscountType } from '../entities/Discount.js';
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
  adjustBalance(userId: string, delta: Money): Promise<User>;
  /** Admin list: newest first, optionally filtered by name, username or id. */
  search(input: { query?: string; limit: number; offset: number }): Promise<{
    entries: UserListEntry[];
    total: number;
  }>;
  setBanned(userId: string, banned: boolean): Promise<User>;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /** Accepts either the HubX uuid or the human-friendly slug. */
  findBySlugOrId(value: string): Promise<Product | null>;
  listActive(): Promise<Product[]>;
  /** Sets or clears the fixed retail price, storing the resulting price. */
  setPriceOverride(productId: string, override: Money | null, sellingPrice: Money): Promise<Product>;
  /** Sets or clears the operator-written product page. */
  setDescription(productId: string, details: string | null): Promise<Product>;
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
  costUSDT: string;
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  listByUser(userId: string, limit: number): Promise<Order[]>;
  markCompleted(id: string, hubxOrderId: string | null, items: DeliveredItem[]): Promise<Order>;
  markStatus(id: string, status: OrderStatus, failureReason?: string): Promise<Order>;
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
