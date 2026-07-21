import type { Telegraf } from 'telegraf';

import type { AdminNotifier } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

/** Fans admin alerts out to every configured operator. */
export class TelegramNotifier implements AdminNotifier {
  constructor(
    private readonly bot: Telegraf,
    private readonly adminIds: bigint[],
    private readonly logger: Logger,
  ) {}

  async alert(message: string): Promise<void> {
    await Promise.all(
      this.adminIds.map(async (id) => {
        try {
          await this.bot.telegram.sendMessage(Number(id), message);
        } catch (error) {
          // An unreachable admin must not break the flow that raised the alert.
          this.logger.error({ err: error, adminId: id.toString() }, 'Failed to deliver admin alert');
        }
      }),
    );
  }
}
