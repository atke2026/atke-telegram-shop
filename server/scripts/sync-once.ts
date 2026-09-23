/**
 * Runs one product sync (YeneShop reseller API → Postgres → Redis).
 * Run: npx tsx scripts/sync-once.ts
 */
import fs from 'node:fs';

import { CACHE_KEYS } from '../src/core/constants.js';
import { RedisCache } from '../src/infrastructure/cache/RedisCache.js';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { PrismaProductRepository } from '../src/infrastructure/database/repositories/PrismaProductRepository.js';
import { YeneShopClient } from '../src/infrastructure/yeneshop/YeneShopClient.js';
import { SyncProductsUseCase } from '../src/use-cases/product/SyncProductsUseCase.js';
import { createLogger } from '../src/shared/logger.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const logger = createLogger('info', true);
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
const cache = RedisCache.connect(process.env.REDIS_URL ?? '', logger);

const useCase = new SyncProductsUseCase({
  yeneshop: new YeneShopClient({
    baseUrl: process.env.YENESHOP_API_URL ?? '',
    apiKey: process.env.YENESHOP_API_KEY ?? '',
    logger,
  }),
  products: new PrismaProductRepository(prisma),
  cache,
  logger,
});

const result = await useCase.execute();
console.log('\nsync result:', result);

const rows = await prisma.product.findMany({ orderBy: { sellingPriceETB: 'asc' } });
console.log(`\npersisted ${rows.length} products:\n`);
for (const row of rows) {
  console.log(
    `  ${row.stock > 0 ? '🟢' : '🔴'} ${row.name.padEnd(46)} ` +
      `${row.costPriceETB.toString().padStart(9)} ETB cost → ${row.sellingPriceETB.toString().padStart(9)} ETB retail  stock ${row.stock}`,
  );
}

const cached = await cache.get<unknown[]>(CACHE_KEYS.products);
const lastSync = await cache.get<string>(CACHE_KEYS.lastSync);
console.log(`\nredis ${CACHE_KEYS.products}: ${cached?.length ?? 0} entries`);
console.log(`redis ${CACHE_KEYS.lastSync}: ${lastSync}`);

await prisma.$disconnect();
await cache.disconnect();
