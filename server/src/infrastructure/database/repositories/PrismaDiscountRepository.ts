import { Prisma, type PrismaClient } from '@prisma/client';

import type { Discount, DiscountScope, DiscountType } from '../../../core/entities/Discount.js';
import type { DiscountRepository } from '../../../core/ports/repositories.js';

type DiscountRow = {
  id: string;
  scope: string;
  productId: string | null;
  type: string;
  value: Prisma.Decimal;
  label: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

function toDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    scope: row.scope as DiscountScope,
    productId: row.productId,
    type: row.type as DiscountType,
    value: row.value.toString(),
    label: row.label,
    isActive: row.isActive,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
  };
}

export class PrismaDiscountRepository implements DiscountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Everything currently switched on. The date window is applied in the domain
   * rather than in SQL, so one query serves every product being priced.
   */
  async listActive(): Promise<Discount[]> {
    const rows = await this.prisma.discount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toDiscount);
  }

  async listAll(): Promise<Discount[]> {
    const rows = await this.prisma.discount.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toDiscount);
  }

  async findById(id: string): Promise<Discount | null> {
    const row = await this.prisma.discount.findUnique({ where: { id } });
    return row ? toDiscount(row) : null;
  }

  async create(input: {
    scope: DiscountScope;
    productId: string | null;
    type: DiscountType;
    value: string;
    label: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    createdByTelegramId: bigint | null;
  }): Promise<Discount> {
    const row = await this.prisma.discount.create({
      data: {
        scope: input.scope,
        productId: input.productId,
        type: input.type,
        value: new Prisma.Decimal(input.value),
        label: input.label,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdByTelegramId: input.createdByTelegramId,
      },
    });

    return toDiscount(row);
  }

  async setActive(id: string, isActive: boolean): Promise<Discount> {
    const row = await this.prisma.discount.update({ where: { id }, data: { isActive } });
    return toDiscount(row);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.prisma.discount.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
