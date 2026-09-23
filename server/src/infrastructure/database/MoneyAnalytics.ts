import { Prisma, type PrismaClient } from '@prisma/client';

import { Money } from '../../core/entities/Money.js';
import type { YeneShopGateway } from '../../core/ports/services.js';

export const ANALYTICS_TIME_ZONE = 'Africa/Addis_Ababa';

const ZERO = new Prisma.Decimal(0);
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface AnalyticsDateRange {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
}

export function todayInAnalyticsTimezone(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function parseAnalyticsDateRange(from: string, to: string): AnalyticsDateRange | null {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return null;
  if (!isCalendarDate(from) || !isCalendarDate(to)) return null;

  const start = new Date(`${from}T00:00:00+03:00`);
  const inclusiveEnd = new Date(`${to}T00:00:00+03:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(inclusiveEnd.getTime()) ||
    start > inclusiveEnd
  ) {
    return null;
  }

  // Addis Ababa has no daylight-saving transition, so a calendar day is
  // always exactly 24 hours. The query uses an exclusive upper bound.
  return {
    from,
    to,
    start,
    endExclusive: new Date(inclusiveEnd.getTime() + ONE_DAY_MS),
  };
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function sum(values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.add(value ?? ZERO), ZERO);
}

function money(value: Prisma.Decimal | string | number) {
  const amount = Money.fromDecimal(value instanceof Prisma.Decimal ? value.toFixed(2) : value);
  return { amount: amount.toDecimalString(), label: amount.format() };
}

export class MoneyAnalytics {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly yeneshop: YeneShopGateway,
  ) {}

  async get(range: AnalyticsDateRange) {
    const inRange = { gte: range.start, lt: range.endExclusive };

    const [
      events,
      pendingOrders,
      actualWallet,
      ledgerWallet,
      openingBalance,
      missingDepositEvents,
      missingPaidEvents,
      missingCompletedEvents,
      completedYeneShopWithoutId,
      liveBalanceETB,
    ] = await Promise.all([
      this.prisma.moneyEvent.findMany({
        where: { occurredAt: inRange },
        orderBy: { occurredAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              productId: true,
              productName: true,
              pricePaidETB: true,
              channel: true,
              product: { select: { source: true } },
            },
          },
        },
      }),
      this.prisma.order.findMany({
        // Normally tiny: a healthy order leaves PAID in milliseconds. Reading
        // the whole unresolved queue lets the checks expose an old stuck order
        // even while the selected report is only "Today".
        where: { status: 'PAID' },
        select: {
          pricePaidETB: true,
          costETB: true,
          createdAt: true,
          product: { select: { source: true } },
        },
      }),
      this.prisma.user.aggregate({ _sum: { balanceETB: true } }),
      // Audit rows survive user deletion. Only wallets that still exist can
      // participate in the comparison with the current user balance total.
      this.prisma.moneyEvent.aggregate({
        where: { userId: { not: null } },
        _sum: { walletDeltaETB: true },
      }),
      this.prisma.moneyEvent.aggregate({
        where: { kind: 'OPENING_BALANCE' },
        _sum: { walletDeltaETB: true },
        _count: { _all: true },
      }),
      this.prisma.deposit.count({
        where: {
          status: 'APPROVED',
          moneyEvents: { none: { kind: 'DEPOSIT_APPROVED' } },
        },
      }),
      this.prisma.order.count({
        where: {
          status: { not: 'PENDING' },
          moneyEvents: { none: { kind: 'ORDER_PAID' } },
        },
      }),
      this.prisma.order.count({
        where: {
          status: 'COMPLETED',
          moneyEvents: { none: { kind: 'ORDER_COMPLETED' } },
        },
      }),
      this.prisma.order.count({
        where: {
          status: 'COMPLETED',
          yeneshopOrderId: null,
          product: { source: 'YENESHOP' },
        },
      }),
      this.yeneshop.getResellerBalanceETB().catch(() => null),
    ]);

    const deposits = events.filter((event) => event.kind === 'DEPOSIT_APPROVED');
    const completed = events.filter((event) => event.kind === 'ORDER_COMPLETED');
    const refunds = events.filter((event) => event.kind === 'ORDER_REFUNDED');
    const adjustments = events.filter((event) => event.kind === 'ADMIN_BALANCE_ADJUSTMENT');
    const retained = events.filter((event) => event.kind === 'ORDER_CANCELLED_NO_REFUND');

    const depositTotal = sum(deposits.map((event) => event.walletDeltaETB));
    const settledSales = sum(completed.map((event) => event.salesETB));
    const spentETB = sum(completed.map((event) => event.costETB));
    const grossProfit = settledSales.sub(spentETB);
    const refundTotal = sum(refunds.map((event) => event.walletDeltaETB));
    const adjustmentTotal = sum(adjustments.map((event) => event.walletDeltaETB));
    const retainedTotal = sum(retained.map((event) => event.order?.pricePaidETB));
    const pendingInRange = pendingOrders.filter(
      (order) => order.createdAt >= range.start && order.createdAt < range.endExclusive,
    );
    const pendingTotal = sum(pendingInRange.map((order) => order.pricePaidETB));
    const possibleSpendETB = sum(
      pendingOrders
        .filter((order) => order.product.source === 'YENESHOP')
        .map((order) => order.costETB),
    );

    const actualWalletTotal = actualWallet._sum.balanceETB ?? ZERO;
    const expectedWalletTotal = ledgerWallet._sum.walletDeltaETB ?? ZERO;
    const mismatch = actualWalletTotal.sub(expectedWalletTotal);

    const products = new Map<
      string,
      {
        productId: string;
        name: string;
        orders: number;
        revenue: Prisma.Decimal;
        costETB: Prisma.Decimal;
      }
    >();
    const channels = {
      RETAIL: { orders: 0, revenue: ZERO },
      RESELLER: { orders: 0, revenue: ZERO },
    };

    for (const event of completed) {
      const order = event.order;
      if (!order) continue;

      const current = products.get(order.productId) ?? {
        productId: order.productId,
        name: order.productName,
        orders: 0,
        revenue: ZERO,
        costETB: ZERO,
      };
      current.orders += 1;
      current.revenue = current.revenue.add(event.salesETB);
      current.costETB = current.costETB.add(event.costETB);
      products.set(order.productId, current);

      channels[order.channel].orders += 1;
      channels[order.channel].revenue = channels[order.channel].revenue.add(event.salesETB);
    }

    const productRows = [...products.values()]
      .map((product) => {
        return {
          productId: product.productId,
          name: product.name,
          orders: product.orders,
          revenue: money(product.revenue),
          costETB: money(product.costETB),
          profit: money(product.revenue.sub(product.costETB)),
        };
      })
      .sort((left, right) => Number(right.profit.amount) - Number(left.profit.amount));

    const anomalyCount =
      missingDepositEvents +
      missingPaidEvents +
      missingCompletedEvents +
      completedYeneShopWithoutId +
      pendingOrders.length +
      (mismatch.isZero() ? 0 : 1);

    return {
      range: {
        from: range.from,
        to: range.to,
        timezone: ANALYTICS_TIME_ZONE,
        estimatedEvents: events.filter((event) => event.estimated).length,
      },
      cash: {
        approvedDeposits: money(depositTotal),
        approvedCount: deposits.length,
      },
      sales: {
        settled: money(settledSales),
        completedCount: completed.length,
        pending: money(pendingTotal),
        pendingCount: pendingInRange.length,
        refunds: money(refundTotal),
        refundCount: refunds.length,
        retainedCancellations: money(retainedTotal),
        retainedCancellationCount: retained.length,
      },
      yeneshop: {
        spentETB: money(spentETB),
        possibleSpendETB: money(possibleSpendETB),
        liveBalanceETB: liveBalanceETB === null ? null : money(liveBalanceETB),
      },
      profit: {
        gross: money(grossProfit),
        marginPercent: settledSales.isZero()
          ? null
          : grossProfit.div(settledSales).mul(100).toDecimalPlaces(1).toString(),
      },
      wallet: {
        actual: money(actualWalletTotal),
        expected: money(expectedWalletTotal),
        mismatch: money(mismatch),
        manualAdjustments: money(adjustmentTotal),
        historicalOpeningAdjustment: money(openingBalance._sum.walletDeltaETB ?? ZERO),
        historicalOpeningCount: openingBalance._count._all,
      },
      channels: {
        retail: {
          orders: channels.RETAIL.orders,
          revenue: money(channels.RETAIL.revenue),
        },
        reseller: {
          orders: channels.RESELLER.orders,
          revenue: money(channels.RESELLER.revenue),
        },
      },
      products: productRows,
      anomalies: {
        count: anomalyCount,
        awaitingDelivery: pendingOrders.length,
        possibleYeneShopSpendETB: money(possibleSpendETB),
        completedYeneShopWithoutId,
        missingLedgerEvents: missingDepositEvents + missingPaidEvents + missingCompletedEvents,
        walletMismatch: money(mismatch),
      },
    };
  }
}
