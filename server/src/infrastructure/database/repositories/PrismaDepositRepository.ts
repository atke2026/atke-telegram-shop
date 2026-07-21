import { Prisma, type PrismaClient } from '@prisma/client';

import type { Deposit, DepositStatus } from '../../../core/entities/Deposit.js';
import { Money } from '../../../core/entities/Money.js';
import type { User } from '../../../core/entities/User.js';
import { DepositAlreadyReviewedError, DepositNotFoundError } from '../../../core/errors/DomainError.js';
import type { DepositRepository } from '../../../core/ports/repositories.js';
import { toUser } from './PrismaUserRepository.js';

type DepositRow = {
  id: string;
  userId: string;
  amountETB: Prisma.Decimal;
  screenshotUrl: string;
  status: string;
  reviewedBy: bigint | null;
  reviewedAt: Date | null;
  rejectionNote: string | null;
  createdAt: Date;
};

function toDeposit(row: DepositRow): Deposit {
  return {
    id: row.id,
    userId: row.userId,
    amount: Money.fromDecimal(row.amountETB),
    screenshotUrl: row.screenshotUrl,
    status: row.status as DepositStatus,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    rejectionNote: row.rejectionNote,
    createdAt: row.createdAt,
  };
}

export class PrismaDepositRepository implements DepositRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { userId: string; amount: Money; screenshotUrl: string }): Promise<Deposit> {
    const row = await this.prisma.deposit.create({
      data: {
        userId: data.userId,
        amountETB: new Prisma.Decimal(data.amount.toDecimalString()),
        screenshotUrl: data.screenshotUrl,
      },
    });

    return toDeposit(row);
  }

  async findById(id: string): Promise<Deposit | null> {
    const row = await this.prisma.deposit.findUnique({ where: { id } });
    return row ? toDeposit(row) : null;
  }

  async listByStatus(status: DepositStatus, limit: number): Promise<Deposit[]> {
    const rows = await this.prisma.deposit.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map(toDeposit);
  }

  async approveAndCredit(depositId: string, reviewerTelegramId: bigint): Promise<{ deposit: Deposit; user: User }> {
    return this.prisma.$transaction(async (tx) => {
      // Conditional on status: a second Approve tap updates 0 rows and bails out
      // before the wallet is touched.
      const claimed = await tx.deposit.updateMany({
        where: { id: depositId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedBy: reviewerTelegramId, reviewedAt: new Date() },
      });

      if (claimed.count === 0) {
        const existing = await tx.deposit.findUnique({ where: { id: depositId } });
        if (!existing) throw new DepositNotFoundError(depositId);

        throw new DepositAlreadyReviewedError(depositId, existing.status);
      }

      const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
      const user = await tx.user.update({
        where: { id: deposit.userId },
        data: { balanceETB: { increment: deposit.amountETB } },
      });

      return { deposit: toDeposit(deposit), user: toUser(user) };
    });
  }

  async reject(depositId: string, reviewerTelegramId: bigint, note: string | null): Promise<Deposit> {
    const claimed = await this.prisma.deposit.updateMany({
      where: { id: depositId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedBy: reviewerTelegramId,
        reviewedAt: new Date(),
        ...(note ? { rejectionNote: note } : {}),
      },
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.deposit.findUnique({ where: { id: depositId } });
      if (!existing) throw new DepositNotFoundError(depositId);

      throw new DepositAlreadyReviewedError(depositId, existing.status);
    }

    return toDeposit(await this.prisma.deposit.findUniqueOrThrow({ where: { id: depositId } }));
  }
}
