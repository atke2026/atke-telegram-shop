/**
 * Prints a signed initData string plus the localStorage snippet that lets the
 * web app run in a normal browser tab during development.
 *
 * Run: npx tsx scripts/dev-init-data.ts
 */
import fs from 'node:fs';

import { signInitData } from '../src/infrastructure/telegram/verifyInitData.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const adminId = (process.env.ADMIN_TELEGRAM_IDS ?? '').split(',')[0]?.trim();
if (!adminId) {
  console.error('ADMIN_TELEGRAM_IDS is not set');
  process.exit(1);
}

const initData = signInitData(
  {
    user: JSON.stringify({ id: Number(adminId), first_name: 'Dev', username: 'dev' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAdev',
  },
  process.env.BOT_TOKEN ?? '',
);

console.log('Paste this into the browser console on http://localhost:5173:\n');
console.log(`localStorage.setItem('dev:initData', ${JSON.stringify(initData)}); location.reload();`);
console.log(
  `\nValid for ${(Number(process.env.INIT_DATA_MAX_AGE_SECONDS ?? 86400) / 3600).toFixed(0)}h.`,
);
