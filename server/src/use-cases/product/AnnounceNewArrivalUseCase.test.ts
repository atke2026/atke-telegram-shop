import { describe, expect, it, vi } from 'vitest';

import { priceWithDiscounts } from '../../core/entities/Discount.js';
import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import { OutOfStockError } from '../../core/errors/DomainError.js';
import type {
  NewArrivalNotifier,
  ProductChannelPublisher,
  ProductImageReader,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import type { PricedCatalogueEntry } from './ListProductsUseCase.js';
import { AnnounceNewArrivalUseCase } from './AnnounceNewArrivalUseCase.js';

function product(id: string, source: Product['source'] = 'YENESHOP'): Product {
  return {
    id,
    slug: `${id}-slug`,
    name: id === 'new' ? 'New Product' : id,
    description: null,
    descriptionOverride: null,
    source,
    deliveryMessage: source === 'MANUAL' ? 'delivery' : null,
    input: null,
    stock: source === 'MANUAL' ? 2_147_483_647 : 5,
    isActive: true,
    operatorAvailable: true,
    costPriceETB: source === 'MANUAL' ? '0' : '1',
    markup: Money.ZERO,
    priceOverride: null,
    sellingPrice: Money.fromDecimal('250'),
    sortOrder: null,
    logoVersion: 0,
    updatedAt: new Date(),
  };
}

function entry(value: Product): PricedCatalogueEntry {
  return {
    product: value,
    priced: priceWithDiscounts(value.sellingPrice, value.id, []),
    soldUnits: 0,
  };
}

describe('AnnounceNewArrivalUseCase', () => {
  const image = Buffer.from('product-image');
  const productImages: ProductImageReader = { read: vi.fn().mockResolvedValue(image) };
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  it.each(['YENESHOP', 'MANUAL'] as const)(
    'moves a %s product first and broadcasts its customer price',
    async (source) => {
      const catalogue = [entry(product('old')), entry(product('new', source)), entry(product('last'))];
      const reorder = { execute: vi.fn().mockResolvedValue({ placed: 3 }) };
      const notifier: NewArrivalNotifier = {
        notifyNewArrival: vi.fn().mockResolvedValue({ delivered: 7, failed: 1 }),
      };
      const channel: ProductChannelPublisher = {
        publishProduct: vi.fn().mockResolvedValue({ messageId: 44 }),
      };
      const useCase = new AnnounceNewArrivalUseCase({
        catalogue: { priced: vi.fn().mockResolvedValue(catalogue) },
        reorder,
        notifier,
        channel,
        productImages,
        logger,
      });

      const result = await useCase.execute({
        slugOrId: 'new-slug',
        announcedByTelegramId: 123n,
      });

      expect(reorder.execute).toHaveBeenCalledWith(['new', 'old', 'last']);
      expect(notifier.notifyNewArrival).toHaveBeenCalledWith({
        productId: 'new',
        productSlug: 'new-slug',
        productName: 'New Product',
        image,
        priceLabel: '250.00 ETB',
        excludeTelegramId: 123n,
      });
      expect(channel.publishProduct).toHaveBeenCalledWith({
        kind: 'NEW_ARRIVAL',
        productSlug: 'new-slug',
        productName: 'New Product',
        image,
        priceLabel: '250.00 ETB',
      });
      expect(result).toEqual({
        productId: 'new',
        priceLabel: '250.00 ETB',
        queued: true,
        channelMessageId: 44,
      });
    },
  );

  it('does not promote or advertise an unavailable YeneShop product', async () => {
    const unavailable = product('new');
    unavailable.stock = 0;
    const reorder = { execute: vi.fn() };
    const notifier: NewArrivalNotifier = { notifyNewArrival: vi.fn() };
    const useCase = new AnnounceNewArrivalUseCase({
      catalogue: { priced: vi.fn().mockResolvedValue([entry(unavailable)]) },
      reorder,
      notifier,
      channel: { publishProduct: vi.fn() },
      productImages,
      logger,
    });

    await expect(
      useCase.execute({ slugOrId: 'new', announcedByTelegramId: 123n }),
    ).rejects.toBeInstanceOf(OutOfStockError);
    expect(reorder.execute).not.toHaveBeenCalled();
    expect(notifier.notifyNewArrival).not.toHaveBeenCalled();
  });

  it('returns without waiting for the customer broadcast to finish', async () => {
    const selected = product('new');
    const notifier: NewArrivalNotifier = {
      // Deliberately never resolves: the panel response must not depend on it.
      notifyNewArrival: vi.fn(
        () => new Promise<{ delivered: number; failed: number }>(() => undefined),
      ),
    };
    const useCase = new AnnounceNewArrivalUseCase({
      catalogue: { priced: vi.fn().mockResolvedValue([entry(selected)]) },
      reorder: { execute: vi.fn().mockResolvedValue({ placed: 1 }) },
      notifier,
      channel: { publishProduct: vi.fn().mockResolvedValue({ messageId: 44 }) },
      productImages,
      logger,
    });

    await expect(
      useCase.execute({ slugOrId: 'new', announcedByTelegramId: 123n }),
    ).resolves.toMatchObject({ productId: 'new', queued: true });
  });
});
