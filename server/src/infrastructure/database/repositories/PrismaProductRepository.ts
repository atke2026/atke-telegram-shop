import { Prisma, type PrismaClient } from '@prisma/client';

import { Money } from '../../../core/entities/Money.js';
import type {
  Product,
  ProductInputType,
  ProductSource,
} from '../../../core/entities/Product.js';
import type { ProductRepository } from '../../../core/ports/repositories.js';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  descriptionOverride: string | null;
  source: ProductSource;
  imageUrl: string | null;
  deliveryType: 'INSTANT' | 'MANUAL';
  deliveryMessage: string | null;
  inputType: ProductInputType | null;
  inputPlaceholder: string | null;
  stock: number;
  isActive: boolean;
  operatorAvailable: boolean;
  costPriceETB: Prisma.Decimal;
  suggestedRetailPriceETB: Prisma.Decimal;
  markupETB: Prisma.Decimal;
  priceOverrideETB: Prisma.Decimal | null;
  sellingPriceETB: Prisma.Decimal;
  sortOrder: number | null;
  logoVersion: number;
  updatedAt: Date;
};

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    descriptionOverride: row.descriptionOverride,
    source: row.source,
    imageUrl: row.imageUrl,
    deliveryType: row.deliveryType,
    deliveryMessage: row.deliveryMessage,
    // Two nullable columns collapse into one optional object: the rest of the
    // app only ever asks "does this product want something?".
    input: row.inputType === null ? null : { type: row.inputType, placeholder: row.inputPlaceholder },
    stock: row.stock,
    isActive: row.isActive,
    operatorAvailable: row.operatorAvailable,
    costPriceETB: row.costPriceETB.toString(),
    suggestedRetailPrice: Money.fromDecimal(row.suggestedRetailPriceETB),
    markup: Money.fromDecimal(row.markupETB),
    priceOverride: row.priceOverrideETB === null ? null : Money.fromDecimal(row.priceOverrideETB),
    sellingPrice: Money.fromDecimal(row.sellingPriceETB),
    sortOrder: row.sortOrder,
    logoVersion: row.logoVersion,
    updatedAt: row.updatedAt,
  };
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? toProduct(row) : null;
  }

  async findBySlugOrId(value: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { OR: [{ id: value }, { slug: value }] },
    });

    return row ? toProduct(row) : null;
  }

  async setPriceOverride(productId: string, override: Money | null, sellingPrice: Money): Promise<Product> {
    const row = await this.prisma.product.update({
      where: { id: productId },
      data: {
        priceOverrideETB: override === null ? null : new Prisma.Decimal(override.toDecimalString()),
        sellingPriceETB: new Prisma.Decimal(sellingPrice.toDecimalString()),
      },
    });

    return toProduct(row);
  }

  async setOperatorAvailable(productId: string, available: boolean): Promise<Product> {
    const row = await this.prisma.product.update({
      where: { id: productId },
      data: { operatorAvailable: available },
    });

    return toProduct(row);
  }

  async setDescription(productId: string, details: string | null): Promise<Product> {
    const row = await this.prisma.product.update({
      where: { id: productId },
      data: { descriptionOverride: details },
    });

    return toProduct(row);
  }

  /** Called after the file is written, so the new URL differs from the old. */
  async bumpLogoVersion(productId: string): Promise<Product> {
    const row = await this.prisma.product.update({
      where: { id: productId },
      data: { logoVersion: { increment: 1 } },
    });

    return toProduct(row);
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];

    // No isActive filter: a customer who bought a product still needs its
    // instructions after it has been delisted.
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    return rows.map(toProduct);
  }

  async listActive(): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      // Legacy local rows are retained only because historical orders still
      // reference them. The live Suq catalogue is exclusively YeneShop-backed.
      where: { isActive: true, source: 'YENESHOP' },
      orderBy: { name: 'asc' },
    });

    return rows.map(toProduct);
  }

  /**
   * Rewrites the hand-picked order. Every listed product is renumbered from
   * zero and anything absent is reset to null, so one call fully describes the
   * arrangement — a partial update could otherwise leave two products fighting
   * over the same position.
   */
  async setSortOrder(orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { id: { notIn: orderedIds }, sortOrder: { not: null } },
        data: { sortOrder: null },
      }),
      ...orderedIds.map((id, index) =>
        this.prisma.product.updateMany({ where: { id }, data: { sortOrder: index } }),
      ),
    ]);
  }

  async clearSortOrder(): Promise<number> {
    const result = await this.prisma.product.updateMany({
      where: { sortOrder: { not: null } },
      data: { sortOrder: null },
    });

    return result.count;
  }

  async upsertMany(products: Product[]): Promise<number> {
    if (products.length === 0) return 0;

    // The admin's markup, fixed price and hand-picked position live only in
    // our database, so a sync must never write `markupETB`,
    // `priceOverrideETB`, `operatorAvailable` or `sortOrder` — it only
    // refreshes upstream-owned fields plus the price the use-case computed.
    await this.prisma.$transaction(
      products.map((product) => {
        const shared = {
          slug: product.slug,
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl ?? null,
          deliveryType: product.deliveryType ?? 'INSTANT',
          inputType: product.input?.type ?? null,
          inputPlaceholder: product.input?.placeholder ?? null,
          stock: product.stock,
          isActive: product.isActive,
          costPriceETB: new Prisma.Decimal(product.costPriceETB),
          suggestedRetailPriceETB: new Prisma.Decimal(
            (product.suggestedRetailPrice ?? product.sellingPrice).toDecimalString(),
          ),
          sellingPriceETB: new Prisma.Decimal(product.sellingPrice.toDecimalString()),
        };

        return this.prisma.product.upsert({
          where: { id: product.id },
          update: shared,
          create: {
            id: product.id,
            ...shared,
            source: 'YENESHOP',
            markupETB: new Prisma.Decimal(product.markup.toDecimalString()),
          },
        });
      }),
    );

    return products.length;
  }

  async deactivateMissing(seenIds: string[]): Promise<number> {
    // An empty list means the sync returned nothing — almost certainly an
    // upstream glitch. Deactivating the whole catalogue on that is not a fix.
    if (seenIds.length === 0) return 0;

    // Scoped to YeneShop rows: legacy rows exist only for order history.
    const result = await this.prisma.product.updateMany({
      where: { id: { notIn: seenIds }, isActive: true, source: 'YENESHOP' },
      data: { isActive: false },
    });

    return result.count;
  }
}
