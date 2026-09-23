import { describe, expect, it, vi } from 'vitest';

import { TelegramNotifier } from './TelegramNotifier.js';

describe('TelegramNotifier automatic backups', () => {
  it('sends the archive only to the current administrators', async () => {
    const sendDocument = vi.fn(
      async (_telegramId: number, _document: unknown, _options: unknown) => ({ message_id: 1 }),
    );
    const resolveAdminIds = vi.fn(async () => [101n, 202n]);
    const notifier = new TelegramNotifier(
      { telegram: { sendDocument } } as never,
      resolveAdminIds,
      async () => [303n],
      '@shop',
      { error: vi.fn() } as never,
    );

    await notifier.notifyBackup({
      archivePath: '/var/lib/yeneshop/backup.tar.gz',
      name: 'backup.tar.gz',
      kind: 'automatic',
      createdAt: '2026-07-29T12:00:00.000Z',
      sizeBytes: 2 * 1024 * 1024,
      warnings: [],
    });

    expect(resolveAdminIds).toHaveBeenCalledOnce();
    expect(sendDocument).toHaveBeenCalledTimes(2);
    expect(sendDocument.mock.calls.map(([telegramId]) => telegramId)).toEqual([101, 202]);
    expect(sendDocument).not.toHaveBeenCalledWith(303, expect.anything(), expect.anything());
  });
});
