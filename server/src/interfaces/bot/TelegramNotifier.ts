import { Input, type Telegraf } from 'telegraf';

import type {
  AdminNotifier,
  DepositNotifier,
  NewDepositNotification,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { depositReviewKeyboard } from './keyboards/menus.js';

/** Fans admin alerts out to every configured operator. */
export class TelegramNotifier implements AdminNotifier, DepositNotifier {
  constructor(
    private readonly bot: Telegraf,
    private readonly adminIds: bigint[],
    private readonly logger: Logger,
  ) {}

  async alert(message: string): Promise<void> {
    await this.fanOut((adminId) => this.bot.telegram.sendMessage(adminId, message));
  }

  async notifyNewDeposit(notification: NewDepositNotification): Promise<void> {
    const { user } = notification;
    const caption =
      `🧾 *New deposit request*\n\n` +
      `User: ${user.firstName ?? 'Unknown'}${user.username ? ` (@${user.username})` : ''}\n` +
      `Telegram ID: \`${user.telegramId}\`\n` +
      `Amount: *${notification.amountLabel}*\n` +
      `Deposit ID: \`${notification.depositId}\``;

    // A file_id can be forwarded as-is; a web upload has to be sent as bytes.
    const photo =
      'fileId' in notification.photo
        ? notification.photo.fileId
        : Input.fromBuffer(notification.photo.buffer);

    await this.fanOut((adminId) =>
      this.bot.telegram.sendPhoto(adminId, photo, {
        caption,
        parse_mode: 'Markdown',
        ...depositReviewKeyboard(notification.depositId),
      }),
    );
  }

  async notifyDepositReviewed(input: {
    telegramId: bigint;
    approved: boolean;
    amountLabel: string;
    newBalanceLabel?: string;
  }): Promise<void> {
    const message = input.approved
      ? `✅ Your deposit of *${input.amountLabel}* was approved!\n\n` +
        `💰 New balance: *${input.newBalanceLabel ?? '—'}*`
      : `❌ Your deposit of ${input.amountLabel} could not be verified.\n\n` +
        `If you believe this is a mistake, please contact support with your receipt.`;

    try {
      await this.bot.telegram.sendMessage(Number(input.telegramId), message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(
        { err: error, telegramId: input.telegramId.toString() },
        'Could not notify customer',
      );
    }
  }

  /** One unreachable admin must never break the flow that raised the notification. */
  private async fanOut(send: (adminId: number) => Promise<unknown>): Promise<void> {
    await Promise.all(
      this.adminIds.map(async (id) => {
        try {
          await send(Number(id));
        } catch (error) {
          this.logger.error({ err: error, adminId: id.toString() }, 'Failed to reach admin');
        }
      }),
    );
  }
}
