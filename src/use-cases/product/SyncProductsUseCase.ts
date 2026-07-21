import { Money } from '../../core/entities/Money.js';
import { calculateSellingPrice, type Product } from '../../core/entities/Product.js';
import type { ConfigRepository, ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort, HubxGateway } from '../../core/ports/services.js';
import { CACHE_KEYS, CONFIG_KEYS } from '../../core/constants.js';
import type { Logger } from '../../shared/logger.js';

export interface SyncProductsResult {
  synced: number;
  deactivated: number;
  rate: string;
}

/**
 * Pulls the HubX catalogue, reprices it into ETB, persists it and refreshes the
 * Redis cache the bot reads from.
 */
export class SyncProductsUseCase {
  constructor(
    private readonly deps: {
      hubx: HubxGateway;
      products: ProductRepository;
      config: ConfigRepository;
      cache: CachePort;
      defaultRate: string;
      logger: Logger;
    },
  ) {}

  async execute(): Promise<SyncProductsResult> {
    const { hubx, products, config, cache, defaultRate, logger } = this.deps;

    const rate = (await config.get(CONFIG_KEYS.usdtEtbRate)) ?? defaultRate;
    const upstream = await hubx.getProducts();

    // Existing rows carry the admin's markup, which the price must include.
    const existing = await products.listActive();
    const markupById = new Map(existing.map((product) => [product.id, product.markup]));

    const repriced: Product[] = upstream.map((item) => {
      const markup = markupById.get(item.id) ?? Money.ZERO;

      return {
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        stock: item.stock,
        isActive: item.isActive,
        costPriceUSDT: item.priceUSDT,
        markup,
        sellingPrice: calculateSellingPrice(item.priceUSDT, rate, markup),
        updatedAt: new Date(),
      };
    });

    const synced = await products.upsertMany(repriced);
    const deactivated = await products.deactivateMissing(repriced.map((product) => product.id));

    await cache.set(
      CACHE_KEYS.products,
      repriced.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        stock: product.stock,
        isActive: product.isActive,
        sellingPriceETB: product.sellingPrice.toDecimalString(),
      })),
      600,
    );
    await cache.set(CACHE_KEYS.lastSync, new Date().toISOString(), 600);

    logger.info({ synced, deactivated, rate }, 'Product sync complete');

    return { synced, deactivated, rate };
  }
}
