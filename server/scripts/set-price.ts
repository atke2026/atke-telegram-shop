/**
 * Sets a fixed retail price for one or more products, using the same use case
 * the bot's /setprice command calls.
 *
 *   npx tsx scripts/set-price.ts <slug> <birr> [<slug> <birr> ...]
 *   npx tsx scripts/set-price.ts --auto <slug>      # back to automatic pricing
 */
import fs from 'node:fs';

import { RedisCache } from '../src/infrastructure/cache/RedisCache.js';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { PrismaConfigRepository } from '../src/infrastructure/database/repositories/PrismaConfigRepository.js';
import { PrismaProductRepository } from '../src/infrastructure/database/repositories/PrismaProductRepository.js';
import { SetProductPriceUseCase } from '../src/use-cases/product/SetProductPriceUseCase.js';
import { createLogger } from '../src/shared/logger.js';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (match?.[1] && !process.env[match[1]]) {
    process.env[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: set-price.ts <slug> <birr> [...]  |  set-price.ts --auto <slug>');
  process.exit(1);
}

const logger = createLogger('warn', false);
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
const cache = RedisCache.connect(process.env.REDIS_URL ?? '', logger);

const useCase = new SetProductPriceUseCase({
  products: new PrismaProductRepository(prisma),
  config: new PrismaConfigRepository(prisma),
  cache,
  defaultRate: process.env.DEFAULT_USDT_ETB_RATE ?? '2000',
});

const pairs: [string, string | null][] =
  args[0] === '--auto'
    ? args.slice(1).map((slug) => [slug, null])
    : Array.from({ length: Math.floor(args.length / 2) }, (_, i) => [
        args[i * 2] as string,
        args[i * 2 + 1] as string,
      ]);

for (const [slug, price] of pairs) {
  try {
    const result = await useCase.execute({ slugOrId: slug, priceETB: price });
    const perUsdt = (
      Number(result.product.sellingPrice.toDecimalString()) / Number(result.product.costPriceUSDT)
    ).toFixed(0);

    console.log(
      `✅ ${result.product.name}\n` +
        `   ${result.previousPrice.format()} → ${result.product.sellingPrice.format()}` +
        `   (${result.product.costPriceUSDT} USDT · ${perUsdt} ETB/USDT)`,
    );
  } catch (error) {
    console.error(`❌ ${slug}: ${(error as Error).message}`);
  }
}

await prisma.$disconnect();
await cache.disconnect();
