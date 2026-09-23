import { Money } from '../../core/entities/Money.js';
import { resolveSellingPrice, type Product } from '../../core/entities/Product.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort, YeneShopGateway } from '../../core/ports/services.js';
import { CACHE_KEYS } from '../../core/constants.js';
import type { Logger } from '../../shared/logger.js';

export interface SyncProductsResult {
  synced: number;
  deactivated: number;
}

/**
 * Pulls Suq's private YeneShop catalogue through the reseller API. The local
 * rows are a read cache plus Suq-owned display settings; they are never an
 * independently managed supplier catalogue.
 */
export class SyncProductsUseCase {
  constructor(
    private readonly deps: {
      yeneshop: YeneShopGateway;
      products: ProductRepository;
      cache: CachePort;
      logger: Logger;
    },
  ) {}

  async execute(): Promise<SyncProductsResult> {
    const { yeneshop, products, cache, logger } = this.deps;
    const upstream = await yeneshop.getProducts();

    // Existing rows carry operator-owned pricing that a sync must preserve.
    // Includes rows YeneShop previously deactivated: if they return later, every
    // operator-owned choice (including availability) must still be there.
    const existing = await products.findByIds(upstream.map((product) => product.id));
    const existingById = new Map(existing.map((product) => [product.id, product]));

    const repriced: Product[] = upstream.map((item) => {
      const current = existingById.get(item.id);
      const markup = current?.markup ?? Money.ZERO;
      const priceOverride = current?.priceOverride ?? null;
      const suggestedRetailPrice = Money.fromDecimal(item.suggestedRetailPriceETB);

      return {
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        // Written by Suq — carry it across untouched.
        descriptionOverride: current?.descriptionOverride ?? null,
        source: 'YENESHOP',
        imageUrl: item.imageUrl,
        deliveryType: item.deliveryType,
        deliveryMessage: null,
        input: item.input,
        stock: item.stock,
        isActive: item.isActive,
        operatorAvailable: current?.operatorAvailable ?? true,
        costPriceETB: item.resellerPriceETB,
        suggestedRetailPrice,
        markup,
        priceOverride,
        sellingPrice: resolveSellingPrice(suggestedRetailPrice, priceOverride),
        // Also ours: upsertMany does not write it, but carrying it keeps the
        // in-memory product honest about where it sits in the catalogue.
        sortOrder: current?.sortOrder ?? null,
        logoVersion: current?.logoVersion ?? 0,
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

    logger.info({ synced, deactivated }, 'YeneShop catalogue sync complete');

    return { synced, deactivated };
  }
}
