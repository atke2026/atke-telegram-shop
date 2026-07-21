/**
 * Verifies the admin API's authorisation boundary against a running server.
 *
 * The point of this script is the negative cases: a valid, correctly signed
 * user who is simply not in the admins table must be refused everywhere.
 *
 * Run (with the server up): npx tsx scripts/check-admin-api.ts
 */
import fs from 'node:fs';

import { signInitData } from '../src/infrastructure/telegram/verifyInitData.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const BASE = `http://127.0.0.1:${process.env.WEB_API_PORT ?? 8080}`;
const TOKEN = process.env.BOT_TOKEN ?? '';
const ADMIN_ID = (process.env.ADMIN_TELEGRAM_IDS ?? '0').split(',')[0]!.trim();
/** A perfectly valid Telegram user who is not in the admins table. */
const OUTSIDER_ID = '999000111';

function initDataFor(id: string, name: string): string {
  return signInitData(
    {
      user: JSON.stringify({ id: Number(id), first_name: name }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    },
    TOKEN,
  );
}

const asAdmin = initDataFor(ADMIN_ID, 'Admin');
const asOutsider = initDataFor(OUTSIDER_ID, 'Outsider');

let failures = 0;

async function check(
  label: string,
  path: string,
  expected: number,
  initData: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `tma ${initData}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const body = await response.json().catch(() => null);
  const ok = response.status === expected;
  if (!ok) failures += 1;

  console.log(`${ok ? '✅' : '❌'} ${label.padEnd(52)} ${response.status} (expected ${expected})`);
  return body;
}

console.log(`Testing ${BASE}\n`);
console.log('--- an ordinary user must be refused everywhere ---');

const ADMIN_ROUTES: [string, string, RequestInit][] = [
  ['GET  /api/admin/summary', '/api/admin/summary', {}],
  ['GET  /api/admin/deposits', '/api/admin/deposits', {}],
  ['GET  /api/admin/products', '/api/admin/products', {}],
  ['GET  /api/admin/admins', '/api/admin/admins', {}],
  ['POST /api/admin/sync', '/api/admin/sync', { method: 'POST' }],
  [
    'POST /api/admin/admins (self-promotion)',
    '/api/admin/admins',
    { method: 'POST', body: JSON.stringify({ telegramId: OUTSIDER_ID }) },
  ],
  [
    'POST /api/admin/users/.../balance (self-credit)',
    `/api/admin/users/${OUTSIDER_ID}/balance`,
    { method: 'POST', body: JSON.stringify({ deltaETB: '999999' }) },
  ],
];

for (const [label, path, init] of ADMIN_ROUTES) {
  await check(`outsider → ${label}`, path, 403, asOutsider, init);
}

console.log('\n--- and must still be a normal customer ---');
await check('outsider → GET /api/products', '/api/products', 200, asOutsider);
const me = (await check('outsider → GET /api/me', '/api/me', 200, asOutsider)) as {
  user?: { isAdmin?: boolean };
};
const flagOk = me?.user?.isAdmin === false;
if (!flagOk) failures += 1;
console.log(`${flagOk ? '✅' : '❌'} outsider → isAdmin is false`);

console.log('\n--- the seeded operator has access ---');
await check('admin → GET /api/admin/summary', '/api/admin/summary', 200, asAdmin);
await check('admin → GET /api/admin/deposits', '/api/admin/deposits', 200, asAdmin);
await check('admin → GET /api/admin/products', '/api/admin/products', 200, asAdmin);

const admins = (await check('admin → GET /api/admin/admins', '/api/admin/admins', 200, asAdmin)) as {
  admins?: { telegramId: string }[];
};
console.log(`     ${admins?.admins?.length ?? 0} administrator(s) registered`);

const adminMe = (await check('admin → GET /api/me', '/api/me', 200, asAdmin)) as {
  user?: { isAdmin?: boolean };
};
const adminFlagOk = adminMe?.user?.isAdmin === true;
if (!adminFlagOk) failures += 1;
console.log(`${adminFlagOk ? '✅' : '❌'} admin → isAdmin is true`);

console.log('\n--- lockout protection ---');
if ((admins?.admins?.length ?? 0) === 1) {
  await check(
    'admin → DELETE the only administrator',
    `/api/admin/admins/${ADMIN_ID}`,
    409,
    asAdmin,
    { method: 'DELETE' },
  );
} else {
  console.log('    skipped: more than one admin registered');
}

console.log('\n--- forged credentials ---');
const forged = signInitData(
  {
    user: JSON.stringify({ id: Number(ADMIN_ID), first_name: 'Admin' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  },
  'not-the-bot-token',
);
await check('forged initData claiming to be the admin', '/api/admin/summary', 401, forged);

console.log(failures === 0 ? '\nauthorisation boundary holds' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
