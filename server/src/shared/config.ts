import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  ADMIN_TELEGRAM_IDS: z
    .string()
    .min(1, 'At least one admin id is required')
    .transform((raw) =>
      raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => BigInt(id)),
    ),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  HUBX_API_URL: z.string().url(),
  HUBX_API_KEY: z.string().min(1, 'HUBX_API_KEY is required'),

  DEFAULT_USDT_ETB_RATE: z.coerce.number().positive(),
  PRODUCT_SYNC_CRON: z.string().default('*/5 * * * *'),

  // --- Web app ---
  WEB_API_PORT: z.coerce.number().int().positive().default(8080),
  WEB_API_HOST: z.string().default('0.0.0.0'),
  /** Comma-separated CORS allowlist. Empty means reflect any origin (dev only). */
  WEB_APP_ORIGINS: z
    .string()
    .default('')
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Where web-app receipt uploads are kept so admins can review them. */
  RECEIPTS_DIR: z.string().default(''),
  /** How long a Telegram initData string stays acceptable. */
  INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}
