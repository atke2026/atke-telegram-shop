/** Read-only smoke test of Suq's YeneShop reseller connection. */
import fs from 'node:fs';

import { Money } from '../src/core/entities/Money.js';
import { YeneShopClient } from '../src/infrastructure/yeneshop/YeneShopClient.js';
import { createLogger } from '../src/shared/logger.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const client = new YeneShopClient({
  baseUrl: process.env.YENESHOP_API_URL ?? '',
  apiKey: process.env.YENESHOP_API_KEY ?? '',
  logger: createLogger('warn', false),
});

const balance = Money.fromDecimal(await client.getResellerBalanceETB());
console.log(`YeneShop reseller balance: ${balance.format()}\n`);

const products = await client.getProducts();
console.log(`Enabled reseller products: ${products.length}\n`);
for (const product of products.slice(0, 8)) {
  const affordable = balance.isLessThan(Money.fromDecimal(product.resellerPriceETB))
    ? ' ⚠️ over reseller balance'
    : '';
  console.log(
    `${product.isActive ? '🟢' : '🔴'} ${product.name}\n` +
      `   ${Money.fromDecimal(product.resellerPriceETB).format()} cost → ` +
      `${Money.fromDecimal(product.suggestedRetailPriceETB).format()} suggested · ` +
      `stock ${product.stock}${affordable}`,
  );
}
