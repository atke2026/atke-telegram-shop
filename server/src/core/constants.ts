/** Cache keys, owned by the domain so use-cases don't reach into infrastructure. */
export const CACHE_KEYS = {
  products: 'suq:products',
  lastSync: 'suq:sync:last_run',
} as const;

/**
 * Stand-in count for a product with no stock to track: everything an operator
 * receives from YeneShop without a finite stock count.
 *
 * Must fit the `stock` column, a 32-bit signed INT4 (max 2,147,483,647) —
 * Number.MAX_SAFE_INTEGER overflows it and the upsert fails — while staying
 * far above any real count, so `stock > 0` keeps letting these products sell
 * and every display can recognise the sentinel and say "unlimited" instead of
 * printing ten digits.
 */
export const UNLIMITED_STOCK = 1_000_000_000;

/**
 * How far back the catalogue looks when ranking products by popularity. Short
 * enough that the order tracks current demand rather than being frozen by an
 * early best-seller.
 */
export const POPULARITY_WINDOW_DAYS = 30;

/**
 * The Telegram account customers reach for help. Kept in sync with the web
 * app's copy in webapp/src/shared/config/support.ts.
 */
export const SUPPORT_USERNAME = 'Atke_Support';
export const SUPPORT_URL = `https://t.me/${SUPPORT_USERNAME}`;

/** Keys of operator-tunable values stored in the Config table. */
export const CONFIG_KEYS = {
  depositInstructions: 'deposit_instructions',
  /** Whole hours between automatic full backups; blank disables the schedule. */
  backupIntervalHours: 'backup_interval_hours',
  /** Exact due time, so an offline server can run a missed backup at startup. */
  backupNextRunAt: 'backup_next_run_at',
  // A single JSON blob so the whole maintenance state loads in one read on the
  // hot path (every bot update and web request consults it).
  maintenance: 'maintenance',
} as const;
