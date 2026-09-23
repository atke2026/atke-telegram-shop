import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfigRepository } from '../../core/ports/repositories.js';
import { BackupManager, postgresEnvironment } from './BackupManager.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function manager(initialInterval: string | null = null) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yeneshop-backup-test-'));
  temporaryDirectories.push(root);
  const values = new Map<string, string>();
  if (initialInterval !== null) values.set('backup_interval_hours', initialInterval);
  const config: ConfigRepository = {
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value);
    }),
  };

  const instance = new BackupManager({
    databaseUrl: 'postgresql://shop:secret@db.example:5439/yeneshop?schema=public',
    backupRoot: root,
    receiptsRoot: path.join(root, 'receipts'),
    logosRoot: path.join(root, 'logos'),
    prisma: {} as never,
    config,
    cache: {} as never,
    receipts: {} as never,
    telegram: {} as never,
    notifier: { notifyBackup: vi.fn(async () => undefined) },
    logger: { warn: vi.fn(), error: vi.fn() } as never,
  });
  await instance.start();
  return { instance, config, root };
}

describe('BackupManager schedule', () => {
  it('stores an hourly interval and schedules the next run', async () => {
    const { instance, config } = await manager();
    const before = Date.now();

    const status = await instance.setIntervalHours(6);

    expect(config.set).toHaveBeenCalledWith('backup_interval_hours', '6');
    expect(status.intervalHours).toBe(6);
    expect(new Date(status.nextRunAt!).getTime()).toBeGreaterThanOrEqual(before + 6 * 3_600_000);
    instance.stop();
  });

  it('supports disabling and rejects unsafe intervals', async () => {
    const { instance } = await manager('24');

    await expect(instance.setIntervalHours(0)).rejects.toBeInstanceOf(RangeError);
    await expect(instance.setIntervalHours(6.5)).rejects.toBeInstanceOf(RangeError);
    const status = await instance.setIntervalHours(null);

    expect(status.intervalHours).toBeNull();
    expect(status.nextRunAt).toBeNull();
    instance.stop();
  });
});

describe('PostgreSQL backup environment', () => {
  it('keeps connection credentials out of command arguments', () => {
    const env = postgresEnvironment(
      'postgresql://shop:p%40ss@db.example:5439/yeneshop?schema=public&sslmode=require',
    );

    expect(env.PGHOST).toBe('db.example');
    expect(env.PGPORT).toBe('5439');
    expect(env.PGUSER).toBe('shop');
    expect(env.PGPASSWORD).toBe('p@ss');
    expect(env.PGDATABASE).toBe('yeneshop');
    expect(env.PGSSLMODE).toBe('require');
  });
});

describe('full archive lifecycle', () => {
  it('packages uploads and rolls them back from a validated archive', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yeneshop-backup-lifecycle-'));
    temporaryDirectories.push(root);
    const bin = path.join(root, 'bin');
    const receiptsRoot = path.join(root, 'receipts');
    const logosRoot = path.join(root, 'logos');
    const backupRoot = path.join(root, 'backups');
    await Promise.all([
      fs.mkdir(bin),
      fs.mkdir(receiptsRoot),
      fs.mkdir(logosRoot),
      fs.mkdir(backupRoot),
    ]);
    await fs.writeFile(path.join(receiptsRoot, 'receipt.jpg'), 'old receipt');
    await fs.writeFile(path.join(logosRoot, 'product.webp'), 'old logo');

    await fs.writeFile(
      path.join(bin, 'pg_dump'),
      `#!/bin/sh
output=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--file" ]; then output="$argument"; fi
  previous="$argument"
done
printf 'PGDMP-test' > "$output"
`,
      { mode: 0o755 },
    );
    await fs.writeFile(path.join(bin, 'pg_restore'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const originalPath = process.env.PATH;
    process.env.PATH = `${bin}:${originalPath ?? ''}`;
    const values = new Map<string, string>();
    const config: ConfigRepository = {
      get: vi.fn(async (key) => values.get(key) ?? null),
      set: vi.fn(async (key, value) => {
        values.set(key, value);
      }),
    };
    const cache = { del: vi.fn(async () => undefined) };
    const prisma = {
      deposit: {
        count: vi.fn(async () => 0),
        findMany: vi.fn(async () => []),
      },
      $disconnect: vi.fn(async () => undefined),
      $connect: vi.fn(async () => undefined),
    };
    const notifyBackup = vi.fn(async () => undefined);
    const instance = new BackupManager({
      databaseUrl: 'postgresql://shop:secret@localhost:5432/yeneshop',
      backupRoot,
      receiptsRoot,
      logosRoot,
      prisma: prisma as never,
      config,
      cache: cache as never,
      receipts: {} as never,
      telegram: {} as never,
      notifier: { notifyBackup },
      logger: { warn: vi.fn(), error: vi.fn() } as never,
    });

    try {
      await instance.start();
      const backup = await instance.createManualBackup(1n);
      expect(notifyBackup).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'manual', name: backup.name }),
      );
      await fs.writeFile(path.join(receiptsRoot, 'receipt.jpg'), 'new receipt');
      await fs.writeFile(path.join(logosRoot, 'product.webp'), 'new logo');
      await fs.writeFile(path.join(receiptsRoot, 'only-new.jpg'), 'remove me');

      await instance.restoreStored(backup.name, 1n);

      await expect(fs.readFile(path.join(receiptsRoot, 'receipt.jpg'), 'utf8')).resolves.toBe(
        'old receipt',
      );
      await expect(fs.readFile(path.join(logosRoot, 'product.webp'), 'utf8')).resolves.toBe(
        'old logo',
      );
      await expect(fs.access(path.join(receiptsRoot, 'only-new.jpg'))).rejects.toThrow();
      expect(prisma.$disconnect).toHaveBeenCalledOnce();
      expect(prisma.$connect).toHaveBeenCalledOnce();
      expect(cache.del).toHaveBeenCalledTimes(2);
      expect((await instance.status()).backups.some((entry) => entry.kind === 'pre-restore')).toBe(
        true,
      );

      // A database failure happens after upload directories have been staged.
      // They must be put back before the failed restore is reported.
      await fs.writeFile(path.join(receiptsRoot, 'receipt.jpg'), 'current receipt');
      await fs.writeFile(
        path.join(bin, 'pg_restore'),
        '#!/bin/sh\nif [ "$1" = "--list" ]; then exit 0; fi\nexit 1\n',
        { mode: 0o755 },
      );
      await expect(instance.restoreStored(backup.name, 1n)).rejects.toThrow();
      await expect(fs.readFile(path.join(receiptsRoot, 'receipt.jpg'), 'utf8')).resolves.toBe(
        'current receipt',
      );
    } finally {
      instance.stop();
      process.env.PATH = originalPath;
    }
  });
});
