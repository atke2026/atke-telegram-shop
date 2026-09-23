import { hasUnlimitedStock, isPurchasable } from '../../core/entities/Product.js';
import {
  ChannelPublishError,
  NoFiniteStockError,
  OutOfStockError,
  ProductImageNotFoundError,
  ProductNotFoundError,
} from '../../core/errors/DomainError.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type {
  ProductChannelPublisher,
  ProductImageReader,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

/** Publishes a finite-stock urgency card to the public channel. */
export class PublishLowStockUseCase {
  constructor(
    private readonly deps: {
      products: ProductRepository;
      productImages: ProductImageReader;
      channel: ProductChannelPublisher;
      logger: Logger;
    },
  ) {}

  async execute(slugOrId: string): Promise<{ messageId: number; stock: number }> {
    const product = await this.deps.products.findBySlugOrId(slugOrId);
    if (!product || !product.isActive) throw new ProductNotFoundError(slugOrId);
    if (!isPurchasable(product)) throw new OutOfStockError(product.id);
    if (hasUnlimitedStock(product)) throw new NoFiniteStockError(product.id);

    const image = await this.deps.productImages.read(product.slug);
    if (!image) throw new ProductImageNotFoundError(product.id);

    try {
      const { messageId } = await this.deps.channel.publishProduct({
        kind: 'LOW_STOCK',
        productSlug: product.slug,
        productName: product.name,
        image,
        stock: product.stock,
      });

      return { messageId, stock: product.stock };
    } catch (error) {
      this.deps.logger.error(
        { err: error, productId: product.id },
        'Could not publish low-stock product to channel',
      );
      throw new ChannelPublishError();
    }
  }
}
