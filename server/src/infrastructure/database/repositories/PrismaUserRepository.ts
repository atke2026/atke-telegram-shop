import { Prisma, type PrismaClient } from '@prisma/client';

import { Money } from '../../../core/entities/Money.js';
import type { User } from '../../../core/entities/User.js';
import { InsufficientBalanceError, UserNotFoundError } from '../../../core/errors/DomainError.js';
import type { UserRepository } from '../../../core/ports/repositories.js';

type UserRow = {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  avatarUrl: string | null;
  balanceETB: Prisma.Decimal;
  isBanned: boolean;
  createdAt: Date;
};

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    telegramId: row.telegramId,
    username: row.username,
    firstName: row.firstName,
    avatarUrl: row.avatarUrl,
    balance: Money.fromDecimal(row.balanceETB),
    isBanned: row.isBanned,
    createdAt: row.createdAt,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findByTelegramId(telegramId: bigint): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { telegramId } });
    return row ? toUser(row) : null;
  }

  async create(data: {
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    // Telegram is the source of truth for the profile, so refresh it on every
    // /start — but an avatar we failed to read must not erase a stored one.
    const profile = {
      username: data.username,
      firstName: data.firstName,
      ...(data.avatarUrl !== undefined && data.avatarUrl !== null ? { avatarUrl: data.avatarUrl } : {}),
    };

    const row = await this.prisma.user.upsert({
      where: { telegramId: data.telegramId },
      update: profile,
      create: { telegramId: data.telegramId, ...profile },
    });

    return toUser(row);
  }

  /**
   * Guarded atomic update: the conditional `updateMany` means two concurrent
   * purchases can never both pass the balance check and overdraw the wallet.
   */
  async adjustBalance(userId: string, delta: Money): Promise<User> {
    const amount = new Prisma.Decimal(delta.toDecimalString());

    const updated = await this.prisma.user.updateMany({
      where: delta.isNegative()
        ? { id: userId, balanceETB: { gte: amount.negated() } }
        : { id: userId },
      data: { balanceETB: { increment: amount } },
    });

    if (updated.count === 0) {
      const existing = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!existing) throw new UserNotFoundError(userId);

      throw new InsufficientBalanceError(amount.negated().toString(), existing.balanceETB.toString());
    }

    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toUser(row);
  }
}
