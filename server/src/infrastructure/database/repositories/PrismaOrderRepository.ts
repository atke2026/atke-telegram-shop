import { Prisma, type PrismaClient } from '@prisma/client';

import { Money } from '../../../core/entities/Money.js';
import type { DeliveredItem, Order, OrderStatus } from '../../../core/entities/Order.js';
import {
  InsufficientBalanceError,
  UserNotFoundError,
} from '../../../core/errors/DomainError.js';
import type {
  CreateOrderInput,
  OrderRepository,
} from '../../../core/ports/repositories.js';

type OrderRow = {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  quantity: number;
  pricePaidETB: Prisma.Decimal;
  costETB: Prisma.Decimal;
  status: string;
  yeneshopOrderId: string | null;
  deliveredItems: Prisma.JsonValue | null;
  failureReason: string | null;
  customerInput: string | null;
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
    costETB: row.costETB.toString(),
    status: row.status as OrderStatus,
    yeneshopOrderId: row.yeneshopOrderId,
    deliveredItems: Array.isArray(row.deliveredItems) ? (row.deliveredItems as DeliveredItem[]) : null,
    failureReason: row.failureReason,
    customerInput: row.customerInput,
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
        costETB: new Prisma.Decimal(input.costETB),
        customerInput: input.customerInput,
        channel: 'RETAIL',
      },
    });

    return toOrder(row);
  }

  /**
   * The debit and the order row commit together or not at all.
   *
   * The order is created already PAID rather than PENDING-then-updated: there
   * is no window in between for a crash to land in, and PAID now means exactly
   * "the customer's money is gone and nothing has been handed over yet", which
   * is what the delivery queue reads.
   *
   * The balance is read back inside the transaction, after the update has
   * locked the row, so the figure returned to the customer is the one their
   * own purchase produced and not a concurrent purchase's.
   */
  async createPaidOrderAndDebit(
    input: CreateOrderInput,
  ): Promise<{ order: Order; newBalance: Money }> {
    const price = new Prisma.Decimal(input.pricePaid.toDecimalString());

    try {
      return await this.prisma.$transaction(async (tx) => {
      // Conditional on the balance covering it: this is the lock. Two
      // simultaneous purchases serialise on the row, and the loser sees a
      // balance that can no longer pay.
      const debited = await tx.user.updateMany({
        where: { id: input.userId, balanceETB: { gte: price } },
        data: { balanceETB: { decrement: price } },
      });

      if (debited.count === 0) {
        const existing = await tx.user.findUnique({ where: { id: input.userId } });
        if (!existing) throw new UserNotFoundError(input.userId);

        throw new InsufficientBalanceError(price.toString(), existing.balanceETB.toString());
      }

      const [user, order] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: input.userId } }),
        tx.order.create({
          data: {
            id: input.id,
            userId: input.userId,
            productId: input.productId,
            productName: input.productName,
            quantity: input.quantity,
            pricePaidETB: price,
            listPriceETB: new Prisma.Decimal(input.listPrice.toDecimalString()),
            discountETB: new Prisma.Decimal(input.discountAmount.toDecimalString()),
            discountId: input.discountId,
            costETB: new Prisma.Decimal(input.costETB),
            customerInput: input.customerInput,
            channel: 'RETAIL',
            status: 'PAID',
          },
        }),
      ]);

      await tx.moneyEvent.create({
        data: {
          kind: 'ORDER_PAID',
          dedupeKey: `order-paid:${order.id}`,
          userId: order.userId,
          orderId: order.id,
          walletDeltaETB: order.pricePaidETB.negated(),
          occurredAt: order.createdAt,
        },
      });

      return { order: toOrder(order), newBalance: Money.fromDecimal(user.balanceETB) };
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Guarded on the order still being PAID, which is what makes a double
   * refund impossible: the second caller updates zero rows and never reaches
   * the credit. The status change and the credit share one transaction, so a
   * failure cannot leave the money returned but the order still owing.
   */
  async refundPaidOrder(
    orderId: string,
    reason: string,
  ): Promise<{ order: Order; refunded: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: 'PAID' },
        data: { status: 'REFUNDED', failureReason: reason },
      });

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      // Someone else already refunded it, or it was never paid for. Either
      // way there is no money of ours to give back.
      if (claimed.count === 0) return { order: toOrder(order), refunded: false };

      await tx.user.update({
        where: { id: order.userId },
        data: { balanceETB: { increment: order.pricePaidETB } },
      });

      await tx.moneyEvent.create({
        data: {
          kind: 'ORDER_REFUNDED',
          dedupeKey: `order-refunded:${order.id}`,
          userId: order.userId,
          orderId: order.id,
          walletDeltaETB: order.pricePaidETB,
        },
      });

      return { order: toOrder(order), refunded: true };
    });
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? toOrder(row) : null;
  }

  async listByUser(userId: string, limit: number): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId, channel: 'RETAIL' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map(toOrder);
  }

  async hasAnyOrder(userId: string): Promise<boolean> {
    // findFirst on the (userId, createdAt) index, selecting a single column:
    // this answers "have they ever bought" without counting a heavy buyer's
    // whole history, and it runs on every app load.
    const row = await this.prisma.order.findFirst({
      where: { userId },
      select: { id: true },
    });

    return row !== null;
  }

  async soldUnitsSince(since: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.order.groupBy({
      by: ['productId'],
      where: { status: 'COMPLETED', createdAt: { gte: since } },
      _sum: { quantity: true },
    });

    return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
  }

  async markCompleted(
    id: string,
    yeneshopOrderId: string | null,
    items: DeliveredItem[],
    actorTelegramId?: bigint,
  ): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          yeneshopOrderId,
          deliveredItems: items as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.moneyEvent.upsert({
        where: { dedupeKey: `order-completed:${row.id}` },
        update: {},
        create: {
          kind: 'ORDER_COMPLETED',
          dedupeKey: `order-completed:${row.id}`,
          userId: row.userId,
          orderId: row.id,
          salesETB: row.pricePaidETB,
          costETB: row.costETB,
          ...(actorTelegramId !== undefined ? { actorTelegramId } : {}),
        },
      });

      return toOrder(row);
    });
  }

  async markAwaitingUpstream(id: string, yeneshopOrderId: string): Promise<Order> {
    const row = await this.prisma.order.update({
      where: { id },
      data: { yeneshopOrderId, status: 'PAID' },
    });
    return toOrder(row);
  }

  /** PAID YeneShop orders which the reconciliation worker must settle. */
  async listAwaitingYeneShop(limit: number): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: 'PAID', product: { source: 'YENESHOP' } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map(toOrder);
  }

  async markStatus(id: string, status: OrderStatus, failureReason?: string): Promise<Order> {
    const row = await this.prisma.order.update({
      where: { id },
      data: { status, ...(failureReason ? { failureReason } : {}) },
    });

    return toOrder(row);
  }
}
