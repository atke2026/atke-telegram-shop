import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { YeneShopGateway } from '../../core/ports/services.js';
import { MoneyAnalytics, parseAnalyticsDateRange } from './MoneyAnalytics.js';

describe('parseAnalyticsDateRange', () => {
  it('uses inclusive Addis Ababa calendar dates', () => {
    const range = parseAnalyticsDateRange('2026-07-01', '2026-07-30');

    expect(range?.start.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(range?.endExclusive.toISOString()).toBe('2026-07-30T21:00:00.000Z');
  });

  it('rejects reversed and impossible calendar ranges', () => {
    expect(parseAnalyticsDateRange('2026-07-30', '2026-07-01')).toBeNull();
    expect(parseAnalyticsDateRange('2026-02-30', '2026-03-01')).toBeNull();
    expect(parseAnalyticsDateRange('not-a-date', '2026-03-01')).toBeNull();
  });
});

describe('MoneyAnalytics', () => {
  it('keeps deposits, settled sales, wallet movement and YeneShop ETB cost distinct', async () => {
    const decimal = (value: string) => new Prisma.Decimal(value);
    const events = [
      {
        kind: 'DEPOSIT_APPROVED',
        walletDeltaETB: decimal('1000'),
        salesETB: decimal('0'),
        costETB: decimal('0'),
        estimated: false,
        order: null,
      },
      {
        kind: 'ORDER_COMPLETED',
        walletDeltaETB: decimal('0'),
        salesETB: decimal('700'),
        costETB: decimal('2'),
        estimated: false,
        order: {
          id: 'order-1',
          productId: 'product-1',
          productName: 'Example',
          pricePaidETB: decimal('700'),
          channel: 'RETAIL',
          product: { source: 'YENESHOP' },
        },
      },
      {
        kind: 'ORDER_REFUNDED',
        walletDeltaETB: decimal('100'),
        salesETB: decimal('0'),
        costETB: decimal('0'),
        estimated: false,
        order: null,
      },
      {
        kind: 'ADMIN_BALANCE_ADJUSTMENT',
        walletDeltaETB: decimal('50'),
        salesETB: decimal('0'),
        costETB: decimal('0'),
        estimated: false,
        order: null,
      },
      {
        kind: 'ORDER_CANCELLED_NO_REFUND',
        walletDeltaETB: decimal('0'),
        salesETB: decimal('0'),
        costETB: decimal('0'),
        estimated: true,
        order: {
          id: 'order-2',
          productId: 'product-2',
          productName: 'Cancelled',
          pricePaidETB: decimal('80'),
          channel: 'RETAIL',
          product: { source: 'MANUAL' },
        },
      },
    ];

    const prisma = {
      moneyEvent: {
        findMany: vi.fn().mockResolvedValue(events),
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { walletDeltaETB: decimal('240') } })
          .mockResolvedValueOnce({
            _sum: { walletDeltaETB: decimal('25') },
            _count: { _all: 1 },
          }),
      },
      order: {
        findMany: vi.fn().mockResolvedValue([
          {
            pricePaidETB: decimal('200'),
            costETB: decimal('1'),
            createdAt: new Date('2026-07-30T10:00:00Z'),
            product: { source: 'YENESHOP' },
          },
        ]),
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(4),
      },
      user: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { balanceETB: decimal('250') } }),
      },
      deposit: {
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient;
    const yeneshop = {
      getResellerBalanceETB: vi.fn().mockResolvedValue('9.25'),
    } as unknown as YeneShopGateway;
    const analytics = new MoneyAnalytics(prisma, yeneshop);
    const range = parseAnalyticsDateRange('2026-07-30', '2026-07-30')!;

    const result = await analytics.get(range);

    expect(result.cash.approvedDeposits.amount).toBe('1000.00');
    expect(result.sales.settled.amount).toBe('700.00');
    expect(result.sales.pending.amount).toBe('200.00');
    expect(result.sales.refunds.amount).toBe('100.00');
    expect(result.sales.retainedCancellations.amount).toBe('80.00');
    expect(result.yeneshop.spentETB.amount).toBe('2.00');
    expect(result.yeneshop.possibleSpendETB.amount).toBe('1.00');
    expect(result.profit.gross.amount).toBe('698.00');
    expect(result.wallet.mismatch.amount).toBe('10.00');
    expect(result.products[0]?.profit.amount).toBe('698.00');
    expect(result.range.estimatedEvents).toBe(1);
    expect(prisma.moneyEvent.aggregate).toHaveBeenNthCalledWith(1, {
      where: { userId: { not: null } },
      _sum: { walletDeltaETB: true },
    });
  });
});
