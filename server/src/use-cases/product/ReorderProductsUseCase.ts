import { CACHE_KEYS } from '../../core/constants.js';
import { ProductNotFoundError } from '../../core/errors/DomainError.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort } from '../../core/ports/services.js';

/**
 * The operator's own catalogue arrangement, set by dragging in the admin
 * panel. It sits above the automatic ranking (discounts, then best sellers)
 * but is stored separately from it, so resetting is a single call that leaves
 * prices and discounts untouched.
 */
export class ReorderProductsUseCase {
  constructor(private readonly deps: { products: ProductRepository; cache: CachePort }) {}

  /**
   * `orderedIds` is the whole arrangement, not a patch: products missing from
   * it go back to ranking automatically. Ids are validated against the live
   * catalogue first, so a stale admin tab cannot half-apply an order built
   * from products that have since been deactivated.
   */
  async execute(orderedIds: string[]): Promise<{ placed: number }> {
    const active = await this.deps.products.listActive();
    const known = new Set(active.map((product) => product.id));

    const unknown = orderedIds.find((id) => !known.has(id));
    if (unknown) throw new ProductNotFoundError(unknown);

    // A Set keeps insertion order, so this drops repeats without reshuffling.
    const deduped = [...new Set(orderedIds)];

    await this.deps.products.setSortOrder(deduped);
    await this.deps.cache.del(CACHE_KEYS.products);

    return { placed: deduped.length };
  }

  /** Back to the automatic order everywhere. */
  async reset(): Promise<{ cleared: number }> {
    const cleared = await this.deps.products.clearSortOrder();
    await this.deps.cache.del(CACHE_KEYS.products);

    return { cleared };
  }
}
