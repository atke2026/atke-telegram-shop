import { CACHE_KEYS, CONFIG_KEYS } from '../../core/constants.js';
import { Money } from '../../core/entities/Money.js';
import { calculateSellingPrice, type Product } from '../../core/entities/Product.js';
import { InvalidAmountError, ProductNotFoundError } from '../../core/errors/DomainError.js';
import type { ConfigRepository, ProductRepository } from '../../core/ports/repositories.js';
import type { CachePort } from '../../core/ports/services.js';

export interface SetProductPriceResult {
  product: Product;
  previousPrice: Money;
  /** What the price would be from cost*rate+markup, for comparison. */
  computedPrice: Money;
}

/**
 * Sets (or clears) a fixed retail price for one product. A fixed price is not
 * recomputed when the exchange rate moves — clearing it returns the product to
 * automatic cost-plus pricing.
 */
export class SetProductPriceUseCase {
  constructor(
    private readonly deps: {
      products: ProductRepository;
      config: ConfigRepository;
      cache: CachePort;
      defaultRate: string;
    },
  ) {}

  async execute(input: { slugOrId: string; priceETB: string | null }): Promise<SetProductPriceResult> {
    const { products, config, cache, defaultRate } = this.deps;

    const product = await products.findBySlugOrId(input.slugOrId);
    if (!product) throw new ProductNotFoundError(input.slugOrId);

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

    const rate = (await config.get(CONFIG_KEYS.usdtEtbRate)) ?? defaultRate;
    const computedPrice = calculateSellingPrice(product.costPriceUSDT, rate, product.markup);

    const updated = await products.setPriceOverride(product.id, override, override ?? computedPrice);

    // The catalogue cache holds prices, so it is stale the moment one changes.
    await cache.del(CACHE_KEYS.products);

    return { product: updated, previousPrice: product.sellingPrice, computedPrice };
  }
}
