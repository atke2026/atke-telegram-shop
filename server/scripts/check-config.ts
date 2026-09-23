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
  console.log('  YeneShop:', config.YENESHOP_API_URL);
  console.log('  key:   ', `${config.YENESHOP_API_KEY.slice(0, 13)}…(${config.YENESHOP_API_KEY.length} chars)`);
  console.log('  token: ', `${config.BOT_TOKEN.split(':')[0]}:…(${config.BOT_TOKEN.length} chars)`);
  console.log('  sync:  ', config.PRODUCT_SYNC_CRON);
} catch (error) {
  console.error('❌', (error as Error).message);
  process.exit(1);
}
