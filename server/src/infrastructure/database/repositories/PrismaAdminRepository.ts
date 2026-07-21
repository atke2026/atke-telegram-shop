import type { PrismaClient } from '@prisma/client';

import type { Admin } from '../../../core/entities/Admin.js';
import type { AdminRepository } from '../../../core/ports/repositories.js';

type AdminRow = {
  id: string;
  telegramId: bigint;
  addedByTelegramId: bigint | null;
  note: string | null;
  createdAt: Date;
};

function toAdmin(row: AdminRow): Admin {
  return {
    id: row.id,
    telegramId: row.telegramId,
    addedByTelegramId: row.addedByTelegramId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isAdmin(telegramId: bigint): Promise<boolean> {
    const row = await this.prisma.admin.findUnique({
      where: { telegramId },
      select: { id: true },
    });

    return row !== null;
  }

  async list(): Promise<Admin[]> {
    const rows = await this.prisma.admin.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toAdmin);
  }

  async count(): Promise<number> {
    return this.prisma.admin.count();
  }

  async add(telegramId: bigint, addedByTelegramId: bigint | null, note: string | null): Promise<Admin> {
    const row = await this.prisma.admin.upsert({
      where: { telegramId },
      update: {},
      create: { telegramId, addedByTelegramId, note },
    });

    return toAdmin(row);
  }

  async remove(telegramId: bigint): Promise<boolean> {
    const result = await this.prisma.admin.deleteMany({ where: { telegramId } });
    return result.count > 0;
  }
}
