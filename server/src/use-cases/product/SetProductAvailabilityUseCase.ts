import { CACHE_KEYS } from '../../core/constants.js';
import { isManual, type Product } from '../../core/entities/Product.js';
import { DomainError, ProductNotFoundError } from '../../core/errors/DomainError.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort } from '../../core/ports/services.js';

export class NotAYeneShopProductError extends DomainError {
  readonly code = 'NOT_A_YENESHOP_PRODUCT';

  constructor(readonly slugOrId: string) {
    super(`Product ${slugOrId} is operator-owned, not synced from YeneShop`);
  }
}

/**
 * The operator's sale switch for a YeneShop product. It never changes upstream
 * stock or activity and sync deliberately leaves it alone.
 */
export class SetProductAvailabilityUseCase {
  constructor(private readonly deps: { products: ProductRepository; cache: CachePort }) {}

  async execute(input: { slugOrId: string; available: boolean }): Promise<Product> {
    const product = await this.deps.products.findBySlugOrId(input.slugOrId);
    if (!product) throw new ProductNotFoundError(input.slugOrId);
    if (isManual(product)) throw new NotAYeneShopProductError(input.slugOrId);

    const updated = await this.deps.products.setOperatorAvailable(product.id, input.available);
    await this.deps.cache.del(CACHE_KEYS.products);
    return updated;
  }
}
