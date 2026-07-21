/**
 * Records an order that was fulfilled outside the normal flow — a HubX order
 * placed by hand, or one lost before it reached the database — so the items
 * appear in the customer's Orders list.
 *
 * No wallet is debited: the money side already happened (or, as with a
 * manually placed HubX order, was paid from the reseller balance rather than a
 * customer's wallet). Pass --price to record a charge that did occur.
 *
 * Usage:
 *   npx tsx scripts/record-manual-order.ts \
 *     --telegram-id 7103165200 \
 *     --product canva-single \
 *     --hubx-order c5f374e7-... \
 *     --external-id 9af77411-... \
 *     --item "license key or instructions" \
 *     [--price 2000] [--cost-usdt 1] [--created-at 2026-07-21T10:31:59Z]
 */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { Money } from '../src/core/entities/Money.js';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { PrismaOrderRepository } from '../src/infrastructure/database/repositories/PrismaOrderRepository.js';
import { PrismaProductRepository } from '../src/infrastructure/database/repositories/PrismaProductRepository.js';
import { PrismaUserRepository } from '../src/infrastructure/database/repositories/PrismaUserRepository.js';

// In development .env sits beside package.json; on the server it lives one
// level up, outside the directory a deploy replaces. Either is fine, and so is
// neither when the variables are already exported.
for (const candidate of ['.env', '../.env']) {
  if (!fs.existsSync(candidate)) continue;

  for (const line of fs.readFileSync(candidate, 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && !process.env[match[1]]) {
      process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
    }
  }
  break;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const telegramId = arg('telegram-id');
const productSlug = arg('product');
const items = process.argv.reduce<string[]>((collected, value, index) => {
  if (value === '--item' && process.argv[index + 1]) collected.push(process.argv[index + 1]!);
  return collected;
}, []);

if (!telegramId || !productSlug || items.length === 0) {
  console.error('--telegram-id, --product and at least one --item are required');
  process.exit(1);
}

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
const users = new PrismaUserRepository(prisma);
const products = new PrismaProductRepository(prisma);
const orders = new PrismaOrderRepository(prisma);

const user = await users.findByTelegramId(BigInt(telegramId));
if (!user) {
  console.error(`no user with telegram id ${telegramId}`);
  process.exit(1);
}

const product = await products.findBySlugOrId(productSlug);
if (!product) {
  console.error(`no product matching "${productSlug}"`);
  process.exit(1);
}

// Reusing the id HubX already knows makes this safe to run twice.
const orderId = arg('external-id') ?? randomUUID();
if (await orders.findById(orderId)) {
  console.log(`order ${orderId} already recorded; nothing to do`);
  await prisma.$disconnect();
  process.exit(0);
}

const price = Money.fromDecimal(arg('price') ?? '0');

await orders.create({
  id: orderId,
  userId: user.id,
  productId: product.id,
  productName: product.name,
  quantity: 1,
  pricePaid: price,
  listPrice: price,
  discountAmount: Money.ZERO,
  discountId: null,
  costUSDT: arg('cost-usdt') ?? '0',
});

await orders.markCompleted(
  orderId,
  arg('hubx-order') ?? null,
  items.map((item) => ({ item })),
);

const createdAt = arg('created-at');
if (createdAt) {
  // Keeps the order in its real place in the customer's history.
  await prisma.order.update({ where: { id: orderId }, data: { createdAt: new Date(createdAt) } });
}

console.log(`✅ recorded for ${user.firstName ?? telegramId}: ${product.name}`);
console.log(`   order ${orderId}`);
console.log(`   charged ${price.format()}`);
for (const item of items) console.log(`   item: ${item}`);

await prisma.$disconnect();
