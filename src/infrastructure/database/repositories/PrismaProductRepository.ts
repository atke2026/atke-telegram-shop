import { Prisma, type PrismaClient } from '@prisma/client';

import { Money } from '../../../core/entities/Money.js';
import type { Product } from '../../../core/entities/Product.js';
import type { ProductRepository } from '../../../core/ports/repositories.js';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stock: number;
  isActive: boolean;
  costPriceUSDT: Prisma.Decimal;
  markupETB: Prisma.Decimal;
  sellingPriceETB: Prisma.Decimal;
  updatedAt: Date;
};

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    stock: row.stock,
    isActive: row.isActive,
    costPriceUSDT: row.costPriceUSDT.toString(),
    markup: Money.fromDecimal(row.markupETB),
    sellingPrice: Money.fromDecimal(row.sellingPriceETB),
    updatedAt: row.updatedAt,
  };
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? toProduct(row) : null;
  }

  async listActive(): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return rows.map(toProduct);
  }

  async upsertMany(products: Product[]): Promise<number> {
    if (products.length === 0) return 0;

    // The admin's per-product markup lives only in our database, so a sync must
    // never overwrite `markupETB` — it only refreshes upstream-owned fields.
    await this.prisma.$transaction(
      products.map((product) => {
        const shared = {
          slug: product.slug,
          name: product.name,
          description: product.description,
          stock: product.stock,
          isActive: product.isActive,
          costPriceUSDT: new Prisma.Decimal(product.costPriceUSDT),
          sellingPriceETB: new Prisma.Decimal(product.sellingPrice.toDecimalString()),
        };

        return this.prisma.product.upsert({
          where: { id: product.id },
          update: shared,
          create: {
            id: product.id,
            ...shared,
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

    const result = await this.prisma.product.updateMany({
      where: { id: { notIn: seenIds }, isActive: true },
      data: { isActive: false },
    });

    return result.count;
  }
}
