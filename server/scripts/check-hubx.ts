/**
 * Read-only smoke test of the HubX integration. Places no orders.
 * Run: npx tsx scripts/check-hubx.ts
 */
import fs from 'node:fs';

import { Money } from '../src/core/entities/Money.js';
import { calculateSellingPrice } from '../src/core/entities/Product.js';
import { HubxClient } from '../src/infrastructure/hubx/HubxClient.js';
import { createLogger } from '../src/shared/logger.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const logger = createLogger('warn', false);
const client = new HubxClient({
  baseUrl: process.env.HUBX_API_URL ?? '',
  apiKey: process.env.HUBX_API_KEY ?? '',
  logger,
});

const rate = process.env.DEFAULT_USDT_ETB_RATE ?? '160';

const balance = await client.getResellerBalanceUSDT();
console.log(`Reseller balance: ${balance} USDT\n`);

const products = await client.getProducts();
console.log(`Products: ${products.length}\n`);

for (const product of products.slice(0, 8)) {
  const price = calculateSellingPrice(product.priceUSDT, rate, Money.ZERO);
  const affordable = Money.fromDecimal(balance).isLessThan(Money.fromDecimal(product.priceUSDT))
    ? ' ⚠️ over reseller balance'
    : '';

  console.log(
    `${product.stock > 0 ? '🟢' : '🔴'} ${product.name}\n` +
      `   ${product.priceUSDT} USDT → ${price.format()} @ ${rate}  · stock ${product.stock}${affordable}`,
  );
}
