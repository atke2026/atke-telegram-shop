import { Input, type Telegraf } from 'telegraf';

import type { DeliveredItem } from '../../core/entities/Order.js';
import type {
  AdminNotifier,
  BackupNotifier,
  DepositNotifier,
  NewArrivalNotification,
  NewArrivalNotifier,
  NewDepositNotification,
  OrderNotifier,
  ProductChannelPost,
  ProductChannelPublisher,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import { escapeHtml } from './html.js';
import { depositReviewKeyboard } from './keyboards/menus.js';

/** Fans admin alerts out to every configured operator. */
export class TelegramNotifier
  implements
    AdminNotifier,
    BackupNotifier,
    DepositNotifier,
    OrderNotifier,
    NewArrivalNotifier,
    ProductChannelPublisher
{
  private botUsername: Promise<string> | null = null;

  /**
   * `resolveAdminIds` is called per notification rather than captured once:
   * admins granted through the panel must start receiving alerts immediately,
   * without a restart.
   */
  constructor(
    private readonly bot: Telegraf,
    private readonly resolveAdminIds: () => Promise<bigint[]>,
    private readonly resolveCustomerIds: () => Promise<bigint[]>,
    private readonly announcementChannel: string,
    private readonly logger: Logger,
  ) {}

  async alert(message: string): Promise<void> {
    await this.fanOut((adminId) => this.bot.telegram.sendMessage(adminId, message));
  }

  async notifyBackup(input: {
    archivePath: string;
    name: string;
    kind: 'automatic' | 'manual';
    createdAt: string;
    sizeBytes: number;
    warnings: string[];
  }): Promise<void> {
    const sizeMb = (input.sizeBytes / (1024 * 1024)).toFixed(2);
    const warningText =
      input.warnings.length === 0
        ? ''
        : `\n⚠️ ${input.warnings.length} warning${input.warnings.length === 1 ? '' : 's'} recorded`;
    const title = input.kind === 'automatic' ? 'Automatic' : 'Manual';
    const caption =
      `🗄 <b>${title} Suq backup</b>\n\n` +
      `Created: <code>${escapeHtml(input.createdAt)}</code>\n` +
      `Size: <b>${sizeMb} MB</b>${warningText}`;

    await this.fanOut((adminId) =>
      this.bot.telegram.sendDocument(adminId, Input.fromLocalFile(input.archivePath, input.name), {
        caption,
        parse_mode: 'HTML',
      }),
    );
  }

  async notifyNewDeposit(notification: NewDepositNotification): Promise<void> {
    const { user } = notification;
    const caption =
      `🧾 <b>New deposit request</b>\n\n` +
      `User: ${escapeHtml(user.firstName ?? 'Unknown')}` +
      (user.username ? ` (@${escapeHtml(user.username)})` : '') +
      `\nTelegram ID: <code>${user.telegramId}</code>\n` +
      `Amount: <b>${escapeHtml(notification.amountLabel)}</b>\n` +
      `Deposit ID: <code>${escapeHtml(notification.depositId)}</code>`;

    // A file_id can be forwarded as-is; a web upload has to be sent as bytes.
    const photo =
      'fileId' in notification.photo
        ? notification.photo.fileId
        : Input.fromBuffer(notification.photo.buffer);

    await this.fanOut((adminId) =>
      this.bot.telegram.sendPhoto(adminId, photo, {
        caption,
        parse_mode: 'HTML',
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

  /**
   * Sends sequentially and slightly below Telegram's broadcast ceiling. One
   * blocked chat is counted and skipped without preventing everyone after it
   * from hearing about the product.
   */
  async notifyNewArrival(
    input: NewArrivalNotification,
  ): Promise<{ delivered: number; failed: number }> {
    let recipients: bigint[];
    try {
      recipients = await this.resolveCustomerIds();
    } catch (error) {
      this.logger.error({ err: error }, 'Could not resolve new-arrival recipients');
      return { delivered: 0, failed: 0 };
    }

    const price = input.listPriceLabel
      ? `💵 Price: <s>${escapeHtml(input.listPriceLabel)}</s> ` +
        `<b>${escapeHtml(input.priceLabel)}</b>` +
        (input.discountLabel ? `\n🏷 ${escapeHtml(input.discountLabel)}` : '')
      : `💵 Price: <b>${escapeHtml(input.priceLabel)}</b>`;

    const message =
      `✨ <b>New arrival!</b>\n\n` +
      `<b>${escapeHtml(input.productName)}</b>\n` +
      `${price}\n\n` +
      `Now available in Suq.`;

    let delivered = 0;
    let failed = 0;

    for (const telegramId of recipients) {
      if (telegramId === input.excludeTelegramId) continue;

      try {
        await this.bot.telegram.sendPhoto(Number(telegramId), Input.fromBuffer(input.image), {
          caption: message,
          parse_mode: 'HTML',
        });
        delivered += 1;
      } catch (error) {
        failed += 1;
        this.logger.debug(
          { err: error, telegramId: telegramId.toString(), productId: input.productId },
          'New-arrival delivery failed',
        );
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }

    return { delivered, failed };
  }

  async publishProduct(post: ProductChannelPost): Promise<{ messageId: number }> {
    const username = await this.resolveBotUsername();

    const productCaption =
      post.kind === 'LOW_STOCK'
        ? `🔥 <b>Only ${post.stock} left!</b>\n\n<b>${escapeHtml(post.productName)}</b>`
        : this.newArrivalCaption(post);
    const caption = `${productCaption}\n\n🛍 Open @${escapeHtml(username)} to buy.`;

    const message = await this.bot.telegram.sendPhoto(
      this.announcementChannel,
      Input.fromBuffer(post.image),
      { caption, parse_mode: 'HTML' },
    );

    return { messageId: message.message_id };
  }

  private newArrivalCaption(post: Extract<ProductChannelPost, { kind: 'NEW_ARRIVAL' }>): string {
    const price = post.listPriceLabel
      ? `💵 Price: <s>${escapeHtml(post.listPriceLabel)}</s> ` +
        `<b>${escapeHtml(post.priceLabel)}</b>` +
        (post.discountLabel ? `\n🏷 ${escapeHtml(post.discountLabel)}` : '')
      : `💵 Price: <b>${escapeHtml(post.priceLabel)}</b>`;

    return (
      `✨ <b>New arrival!</b>\n\n` +
      `<b>${escapeHtml(post.productName)}</b>\n` +
      price
    );
  }

  private resolveBotUsername(): Promise<string> {
    this.botUsername ??= this.bot.telegram.getMe().then((me) => {
      if (!me.username) throw new Error('Bot account has no username');
      return me.username;
    });
    return this.botUsername;
  }

  /**
   * The item an operator just typed, sent to the person waiting on it.
   *
   * HTML, like the purchase receipt: delivered links and credentials are full
   * of _ * ( ) that Telegram's Markdown parser rejects, and <code> keeps a
   * redeem link tappable-to-copy and unmangled.
   *
   * A failure here is logged, not thrown: the order really has been delivered
   * — the items are on it, and the app shows them — so refusing the operator's
   * click because Telegram was briefly unreachable would be the wrong trade.
   */
  async notifyOrderDelivered(input: {
    telegramId: bigint;
    productName: string;
    items: DeliveredItem[];
    instructions: string | null;
  }): Promise<void> {
    const items = input.items
      .map(
        (item) =>
          `<code>${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item))}</code>`,
      )
      .join('\n\n');

    try {
      await this.bot.telegram.sendMessage(
        Number(input.telegramId),
        `✅ <b>Your order is ready!</b>\n\n` +
          `${escapeHtml(input.productName)}\n\n` +
          `🎁 <b>Your item(s):</b>\n${items}`,
        { parse_mode: 'HTML' },
      );

      // Sent separately rather than appended: a long set of steps plus a
      // redeem link can pass Telegram's 4096-character limit, which would
      // drop the whole message — including the item.
      if (input.instructions) {
        await this.bot.telegram.sendMessage(
          Number(input.telegramId),
          `📖 <b>How to use it</b>\n\n${escapeHtml(input.instructions)}`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (error) {
      this.logger.error(
        { err: error, telegramId: input.telegramId.toString() },
        'Could not send a delivered order to the customer',
      );
    }
  }

  /**
   * Tells a buyer their order will not be delivered.
   *
   * Whether the money came back is stated outright, and the balance with it:
   * "cancelled" alone is the message most likely to bring the customer to
   * support, and the answer they want is always about the money.
   *
   * Logged rather than thrown, like a delivery: the order is already settled
   * and the refund already credited, so an unreachable chat must not undo a
   * decision the operator has made.
   */
  async notifyOrderCancelled(input: {
    telegramId: bigint;
    productName: string;
    refundedLabel: string | null;
    newBalanceLabel: string | null;
    reason: string | null;
  }): Promise<void> {
    const money = input.refundedLabel
      ? `💰 <b>${escapeHtml(input.refundedLabel)}</b> has been returned to your balance.` +
        (input.newBalanceLabel
          ? `\nYour balance is now <b>${escapeHtml(input.newBalanceLabel)}</b>.`
          : '')
      : `This order was cancelled without a refund.`;

    try {
      await this.bot.telegram.sendMessage(
        Number(input.telegramId),
        `⚠️ <b>Your order was cancelled</b>\n\n` +
          `${escapeHtml(input.productName)}\n\n` +
          `${money}` +
          (input.reason ? `\n\n<b>Reason:</b> ${escapeHtml(input.reason)}` : ''),
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(
        { err: error, telegramId: input.telegramId.toString() },
        'Could not tell the customer their order was cancelled',
      );
    }
  }

  /** One unreachable admin must never break the flow that raised the notification. */
  private async fanOut(send: (adminId: number) => Promise<unknown>): Promise<void> {
    let adminIds: bigint[];
    try {
      adminIds = await this.resolveAdminIds();
    } catch (error) {
      this.logger.error({ err: error }, 'Could not resolve administrators to notify');
      return;
    }

    if (adminIds.length === 0) {
      this.logger.error('No administrators configured; alert dropped');
      return;
    }

    await Promise.all(
      adminIds.map(async (id) => {
        try {
          await send(Number(id));
        } catch (error) {
          this.logger.error({ err: error, adminId: id.toString() }, 'Failed to reach admin');
        }
      }),
    );
  }
}
