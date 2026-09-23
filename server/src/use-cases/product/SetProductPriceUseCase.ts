import { CACHE_KEYS } from '../../core/constants.js';
import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import { InvalidAmountError, ProductNotFoundError } from '../../core/errors/DomainError.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort } from '../../core/ports/services.js';

export interface SetProductPriceResult {
  product: Product;
  previousPrice: Money;
  /** YeneShop's suggested retail price, for comparison. */
  computedPrice: Money;
}

/**
 * Sets (or clears) a fixed retail price for one product. A fixed price is not
 * overwritten by a catalogue refresh. Clearing it returns the product to
 * YeneShop's current suggested retail price.
 */
export class SetProductPriceUseCase {
  constructor(
    private readonly deps: {
      products: ProductRepository;
      cache: CachePort;
    },
  ) {}

  async execute(input: { slugOrId: string; priceETB: string | null }): Promise<SetProductPriceResult> {
    const { products, cache } = this.deps;

    const product = await products.findBySlugOrId(input.slugOrId);
    if (!product) throw new ProductNotFoundError(input.slugOrId);
    if (product.source !== 'YENESHOP') throw new ProductNotFoundError(input.slugOrId);

    let override: Money | null = null;
    if (input.priceETB !== null) {
      try {
        override = Money.fromDecimal(input.priceETB);
      } catch {
        throw new InvalidAmountError(`"${input.priceETB}" is not a valid price`);
      }

      if (override.isNegative() || override.isZero()) {
        throw new InvalidAmountError('Price must be greater than zero');
      }
    }

    const computedPrice = product.suggestedRetailPrice ?? product.sellingPrice;

    const updated = await products.setPriceOverride(product.id, override, override ?? computedPrice);

    // The catalogue cache holds prices, so it is stale the moment one changes.
    await cache.del(CACHE_KEYS.products);

    return { product: updated, previousPrice: product.sellingPrice, computedPrice };
  }
}
