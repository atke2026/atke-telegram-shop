import { isPurchasable } from '../../core/entities/Product.js';
import {
  ChannelPublishError,
  OutOfStockError,
  ProductImageNotFoundError,
  ProductNotFoundError,
} from '../../core/errors/DomainError.js';
import type {
  NewArrivalNotifier,
  ProductChannelPublisher,
  ProductImageReader,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import type { ListProductsUseCase } from './ListProductsUseCase.js';
import type { ReorderProductsUseCase } from './ReorderProductsUseCase.js';

/**
 * Promotes one live product and tells every customer about it.
 *
 * The priced catalogue is the source for both the preserved order and the
 * announcement amount. That keeps every YeneShop product on exactly
 * the same path, and guarantees the bot advertises the price checkout charges.
 */
export class AnnounceNewArrivalUseCase {
  constructor(
    private readonly deps: {
      catalogue: Pick<ListProductsUseCase, 'priced'>;
      reorder: Pick<ReorderProductsUseCase, 'execute'>;
      notifier: NewArrivalNotifier;
      channel: ProductChannelPublisher;
      productImages: ProductImageReader;
      logger: Logger;
    },
  ) {}

  async execute(input: {
    slugOrId: string;
    announcedByTelegramId: bigint;
  }): Promise<{
    productId: string;
    priceLabel: string;
    queued: true;
    channelMessageId: number;
  }> {
    const catalogue = await this.deps.catalogue.priced();
    const selected = catalogue.find(
      ({ product }) => product.id === input.slugOrId || product.slug === input.slugOrId,
    );

    if (!selected) throw new ProductNotFoundError(input.slugOrId);
    if (!isPurchasable(selected.product)) throw new OutOfStockError(selected.product.id);

    const image = await this.deps.productImages.read(selected.product.slug);
    if (!image) throw new ProductImageNotFoundError(selected.product.id);

    // Keep every other row in the order currently visible to customers.
    await this.deps.reorder.execute([
      selected.product.id,
      ...catalogue
        .filter(({ product }) => product.id !== selected.product.id)
        .map(({ product }) => product.id),
    ]);

    const priceLabel = selected.priced.finalPrice.format();
    const notification = {
      productId: selected.product.id,
      productSlug: selected.product.slug,
      productName: selected.product.name,
      image,
      priceLabel,
      ...(selected.priced.discount
        ? {
            listPriceLabel: selected.priced.listPrice.format(),
            ...(selected.priced.discount.label
              ? { discountLabel: selected.priced.discount.label }
              : {}),
          }
        : {}),
      excludeTelegramId: input.announcedByTelegramId,
    };

    let channelMessageId: number;
    try {
      ({ messageId: channelMessageId } = await this.deps.channel.publishProduct({
        kind: 'NEW_ARRIVAL',
        productSlug: selected.product.slug,
        productName: selected.product.name,
        image,
        priceLabel,
        ...(selected.priced.discount
          ? {
              listPriceLabel: selected.priced.listPrice.format(),
              ...(selected.priced.discount.label
                ? { discountLabel: selected.priced.discount.label }
                : {}),
            }
          : {}),
      }));
    } catch (error) {
      this.deps.logger.error(
        { err: error, productId: selected.product.id },
        'Could not publish new arrival to channel',
      );
      throw new ChannelPublishError();
    }

    // A broadcast to hundreds of chats takes longer than an HTTP request is
    // allowed to stay open. Start it after the ordering commit and return to
    // the panel immediately; delivery failures are already isolated per user.
    void this.deps.notifier
      .notifyNewArrival(notification)
      .then(({ delivered, failed }) => {
        this.deps.logger.warn(
          {
            by: input.announcedByTelegramId.toString(),
            productId: selected.product.id,
            delivered,
            failed,
          },
          'New arrival announcement finished',
        );
      })
      .catch((error) => {
        this.deps.logger.error(
          { err: error, productId: selected.product.id },
          'New arrival announcement stopped unexpectedly',
        );
      });

    return {
      productId: selected.product.id,
      priceLabel,
      queued: true,
      channelMessageId,
    };
  }
}
