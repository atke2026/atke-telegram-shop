/** Cache keys, owned by the domain so use-cases don't reach into infrastructure. */
export const CACHE_KEYS = {
  products: 'hubx:products',
  lastSync: 'hubx:sync:last_run',
} as const;

/** Keys of operator-tunable values stored in the Config table. */
export const CONFIG_KEYS = {
  usdtEtbRate: 'usdt_etb_rate',
  depositInstructions: 'deposit_instructions',
} as const;
