import { Prisma, type PrismaClient } from '@prisma/client';

import { Money } from '../../../core/entities/Money.js';
import type { DeliveredItem, Order, OrderStatus } from '../../../core/entities/Order.js';
import type { CreateOrderInput, OrderRepository } from '../../../core/ports/repositories.js';

type OrderRow = {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaidETB: Prisma.Decimal;
  costUSDT: Prisma.Decimal;
  status: string;
  hubxOrderId: string | null;
  deliveredItems: Prisma.JsonValue | null;
  failureReason: string | null;
  createdAt: Date;
};

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.userId,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    pricePaid: Money.fromDecimal(row.pricePaidETB),
    costUSDT: row.costUSDT.toString(),
    status: row.status as OrderStatus,
    hubxOrderId: row.hubxOrderId,
    deliveredItems: Array.isArray(row.deliveredItems) ? (row.deliveredItems as DeliveredItem[]) : null,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateOrderInput): Promise<Order> {
    const row = await this.prisma.order.create({
      data: {
        id: input.id,
        userId: input.userId,
        productId: input.productId,
        productName: input.productName,
        quantity: input.quantity,
        pricePaidETB: new Prisma.Decimal(input.pricePaid.toDecimalString()),
        listPriceETB: new Prisma.Decimal(input.listPrice.toDecimalString()),
        discountETB: new Prisma.Decimal(input.discountAmount.toDecimalString()),
        discountId: input.discountId,
        costUSDT: new Prisma.Decimal(input.costUSDT),
      },
    });

    return toOrder(row);
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? toOrder(row) : null;
  }

  async listByUser(userId: string, limit: number): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map(toOrder);
  }

  async markCompleted(id: string, hubxOrderId: string | null, items: DeliveredItem[]): Promise<Order> {
    const row = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        hubxOrderId,
        deliveredItems: items as unknown as Prisma.InputJsonValue,
      },
    });

    return toOrder(row);
  }

  async markStatus(id: string, status: OrderStatus, failureReason?: string): Promise<Order> {
    const row = await this.prisma.order.update({
      where: { id },
      data: { status, ...(failureReason ? { failureReason } : {}) },
    });

    return toOrder(row);
  }
}
