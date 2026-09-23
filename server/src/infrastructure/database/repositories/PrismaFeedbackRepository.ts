import type { PrismaClient } from '@prisma/client';

import type { Feedback } from '../../../core/entities/Feedback.js';
import type { FeedbackListEntry, FeedbackRepository } from '../../../core/ports/repositories.js';
import { toUser } from './PrismaUserRepository.js';

type FeedbackRow = {
  id: string;
  userId: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
};

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    userId: row.userId,
    rating: row.rating,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaFeedbackRepository implements FeedbackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(userId: string, rating: number): Promise<Feedback> {
    const row = await this.prisma.feedback.upsert({
      where: { userId },
      update: { rating },
      create: { userId, rating },
    });

    return toFeedback(row);
  }

  async findByUserId(userId: string): Promise<Feedback | null> {
    const row = await this.prisma.feedback.findUnique({ where: { userId } });
    return row ? toFeedback(row) : null;
  }

  async list(input: { limit: number; offset: number }): Promise<{
    entries: FeedbackListEntry[];
    total: number;
    average: number | null;
  }> {
    // The average is computed over the whole table, not the page: it is a
    // headline figure for the tab, so paging through must not change it.
    const [rows, total, aggregate] = await Promise.all([
      this.prisma.feedback.findMany({
        orderBy: { updatedAt: 'desc' },
        take: input.limit,
        skip: input.offset,
        include: { user: true },
      }),
      this.prisma.feedback.count(),
      this.prisma.feedback.aggregate({ _avg: { rating: true } }),
    ]);

    return {
      entries: rows.map((row) => ({ feedback: toFeedback(row), user: toUser(row.user) })),
      total,
      average: aggregate._avg.rating ?? null,
    };
  }
}
