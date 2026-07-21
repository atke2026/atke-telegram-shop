import type { Deposit, DepositStatus } from '../entities/Deposit.js';
import type { DeliveredItem, Order, OrderStatus } from '../entities/Order.js';
import type { Product } from '../entities/Product.js';
import type { User } from '../entities/User.js';
import type { Money } from '../entities/Money.js';

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
