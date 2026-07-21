import type { PrismaClient } from '@prisma/client';

import type { ConfigRepository } from '../../../core/ports/repositories.js';

export class PrismaConfigRepository implements ConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.config.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
