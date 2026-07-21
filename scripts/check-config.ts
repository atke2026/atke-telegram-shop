/**
 * Validates .env without printing secrets. Run: npx tsx scripts/check-config.ts
 */
import fs from 'node:fs';

import { loadConfig } from '../src/shared/config.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

try {
  const config = loadConfig();

  console.log('✅ config valid');
  console.log('  admins:', config.ADMIN_TELEGRAM_IDS.map(String).join(', '));
  console.log('  hubx:  ', config.HUBX_API_URL);
  console.log('  key:   ', `${config.HUBX_API_KEY.slice(0, 8)}…(${config.HUBX_API_KEY.length} chars)`);
  console.log('  token: ', `${config.BOT_TOKEN.split(':')[0]}:…(${config.BOT_TOKEN.length} chars)`);
  console.log('  rate:  ', config.DEFAULT_USDT_ETB_RATE, 'ETB/USDT');
  console.log('  sync:  ', config.PRODUCT_SYNC_CRON);
} catch (error) {
  console.error('❌', (error as Error).message);
  process.exit(1);
}
