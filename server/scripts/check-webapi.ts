/**
 * Exercises the web API against the running server using a correctly signed
 * initData string. Read-only: it never places an order, because that would
 * spend real HubX balance.
 *
 * Run (with the server up): npx tsx scripts/check-webapi.ts
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

const initData = signInitData(
  {
    user: JSON.stringify({ id: Number(ADMIN_ID), first_name: 'AMIXMON', username: 'cipher_me' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAsmoketest',
  },
  TOKEN,
);

let failures = 0;

async function check(
  label: string,
  path: string,
  expectedStatus: number,
  init: RequestInit = {},
  authorised = true,
): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(authorised ? { Authorization: `tma ${initData}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  const ok = response.status === expectedStatus;
  if (!ok) failures += 1;

  console.log(`${ok ? '✅' : '❌'} ${label.padEnd(44)} ${response.status} (expected ${expectedStatus})`);
  return body;
}

console.log(`Testing ${BASE}\n`);

await check('GET  /api/health (no auth needed)', '/api/health', 200, {}, false);

// --- Authentication ---
await check('GET  /api/me without credentials', '/api/me', 401, {}, false);
await check('GET  /api/me with a forged hash', '/api/me', 401, {
  headers: { Authorization: `tma ${initData.replace(/hash=.*$/, 'hash=deadbeef')}` },
}, false);

const me = (await check('GET  /api/me', '/api/me', 200)) as { user?: { balance?: { label: string } } };
console.log(`     balance: ${me?.user?.balance?.label ?? '—'}`);

// --- Catalogue ---
const products = (await check('GET  /api/products', '/api/products', 200)) as {
  products?: { slug: string; name: string; price: { label: string }; inStock: boolean; logoUrl: string }[];
};
console.log(`     ${products?.products?.length ?? 0} products`);
for (const product of (products?.products ?? []).slice(0, 3)) {
  console.log(
    `       ${product.inStock ? 'in stock ' : 'sold out '} ${product.name} — ${product.price.label} — ${product.logoUrl}`,
  );
}

const firstSlug = products?.products?.[0]?.slug;
if (firstSlug) await check(`GET  /api/products/${firstSlug}`, `/api/products/${firstSlug}`, 200);
await check('GET  /api/products/does-not-exist', '/api/products/does-not-exist', 404);

// --- Orders & deposits (reads only) ---
await check('GET  /api/orders', '/api/orders', 200);

const deposits = (await check('GET  /api/deposits', '/api/deposits', 200)) as {
  minimum?: { label: string };
};
console.log(`     minimum deposit: ${deposits?.minimum?.label ?? '—'}`);

// --- Validation paths that must not create anything ---
await check('POST /api/orders with no productId', '/api/orders', 400, {
  method: 'POST',
  body: JSON.stringify({}),
});
await check('POST /api/orders with unknown product', '/api/orders', 404, {
  method: 'POST',
  body: JSON.stringify({ productId: 'nope' }),
});
await check('POST /api/deposits with no receipt', '/api/deposits', 400, {
  method: 'POST',
  body: JSON.stringify({ amountETB: '2000' }),
});
await check('POST /api/deposits below the minimum', '/api/deposits', 409, {
  method: 'POST',
  body: JSON.stringify({ amountETB: '1', receiptBase64: Buffer.from('x').toString('base64') }),
});

console.log(failures === 0 ? '\nall endpoints behaved as expected' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
