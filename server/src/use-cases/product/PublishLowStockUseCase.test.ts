import { describe, expect, it, vi } from 'vitest';

import { Money } from '../../core/entities/Money.js';
import type { Product } from '../../core/entities/Product.js';
import {
  ChannelPublishError,
  NoFiniteStockError,
  ProductImageNotFoundError,
} from '../../core/errors/DomainError.js';
import type { ProductRepository } from '../../core/ports/repositories.js';
import type {
  ProductChannelPublisher,
  ProductImageReader,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { PublishLowStockUseCase } from './PublishLowStockUseCase.js';

function product(): Product {
  return {
    id: 'yeneshop-1',
    slug: 'limited-product',
    name: 'Limited Product',
    description: null,
    descriptionOverride: null,
    source: 'YENESHOP',
    deliveryMessage: null,
    input: null,
    stock: 3,
    isActive: true,
    operatorAvailable: true,
    costPriceETB: '1',
    markup: Money.ZERO,
    priceOverride: null,
    sellingPrice: Money.fromDecimal('250'),
    sortOrder: null,
    logoVersion: 0,
    updatedAt: new Date(),
  };
}

const logger = { error: vi.fn() } as unknown as Logger;

function setup(input?: {
  value?: Product;
  image?: Buffer | null;
  publish?: ProductChannelPublisher['publishProduct'];
}) {
  const value = input?.value ?? product();
  const products = {
    findBySlugOrId: vi.fn().mockResolvedValue(value),
  } as unknown as ProductRepository;
  const productImages: ProductImageReader = {
    read: vi.fn().mockResolvedValue(input?.image === undefined ? Buffer.from('image') : input.image),
  };
  const channel: ProductChannelPublisher = {
    publishProduct: input?.publish ?? vi.fn().mockResolvedValue({ messageId: 99 }),
  };

  return {
    products,
    productImages,
    channel,
    useCase: new PublishLowStockUseCase({ products, productImages, channel, logger }),
  };
}

describe('PublishLowStockUseCase', () => {
  it('publishes the current finite stock with the product image', async () => {
    const { useCase, channel } = setup();

    await expect(useCase.execute('limited-product')).resolves.toEqual({
      messageId: 99,
      stock: 3,
    });
    expect(channel.publishProduct).toHaveBeenCalledWith({
      kind: 'LOW_STOCK',
      productSlug: 'limited-product',
      productName: 'Limited Product',
      image: Buffer.from('image'),
      stock: 3,
    });
  });

  it('rejects products with unlimited stock', async () => {
    const value = product();
    value.source = 'MANUAL';
    value.stock = 2_147_483_647;
    const { useCase, channel } = setup({ value });

    await expect(useCase.execute(value.slug)).rejects.toBeInstanceOf(NoFiniteStockError);
    expect(channel.publishProduct).not.toHaveBeenCalled();
  });

  it('requires a product picture', async () => {
    const { useCase, channel } = setup({ image: null });

    await expect(useCase.execute('limited-product')).rejects.toBeInstanceOf(
      ProductImageNotFoundError,
    );
    expect(channel.publishProduct).not.toHaveBeenCalled();
  });

  it('turns Telegram failures into a channel-specific error', async () => {
    const { useCase } = setup({
      publish: vi.fn().mockRejectedValue(new Error('not enough rights')),
    });

    await expect(useCase.execute('limited-product')).rejects.toBeInstanceOf(ChannelPublishError);
  });
});
