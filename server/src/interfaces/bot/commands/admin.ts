import type { Telegraf } from 'telegraf';

import { CONFIG_KEYS } from '../../../core/constants.js';
import { Money } from '../../../core/entities/Money.js';
import { hasUnlimitedStock } from '../../../core/entities/Product.js';
import type { Container } from '../../../shared/container.js';
import type { BotContext } from '../context.js';
import { toUserMessage } from '../../../shared/errorMessages.js';
import { broadcastConfirmKeyboard } from '../keyboards/menus.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function registerAdminCommands(bot: Telegraf<BotContext>, container: Container): void {
  const { useCases, repositories, logger } = container;

  /** Every admin handler starts with this — no exceptions. */
  const requireAdmin = async (ctx: BotContext): Promise<boolean> => {
    if (ctx.isAdmin) return true;

    if (ctx.callbackQuery) await ctx.answerCbQuery('Not authorised');
    else await ctx.reply('🚫 This command is for administrators only.');

    logger.warn({ telegramId: ctx.from?.id }, 'Rejected non-admin command');
    return false;
  };

  bot.action(/^deposit:approve:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const depositId = ctx.match[1];
    if (!depositId || !ctx.from) return;

    try {
      const { deposit, user } = await useCases.approveDeposit.execute({
        depositId,
        reviewerTelegramId: BigInt(ctx.from.id),
      });

      await ctx.answerCbQuery('Approved');
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply(`✅ Approved ${deposit.amount.format()} — new balance ${user.balance.format()}.`);

      await bot.telegram.sendMessage(
        Number(user.telegramId),
        `✅ Your deposit of *${deposit.amount.format()}* was approved!\n\n` +
          `💰 New balance: *${user.balance.format()}*`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      logger.error({ err: error, depositId }, 'Deposit approval failed');
      await ctx.answerCbQuery('Failed');
      await ctx.reply(toUserMessage(error));
    }
  });

  bot.action(/^deposit:reject:(.+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const depositId = ctx.match[1];
    if (!depositId || !ctx.from) return;

    try {
      const deposit = await useCases.rejectDeposit.execute({
        depositId,
        reviewerTelegramId: BigInt(ctx.from.id),
      });

      await ctx.answerCbQuery('Rejected');
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply(`❌ Rejected deposit ${deposit.id}.`);

      const user = await repositories.users.findById(deposit.userId);
      if (user) {
        await bot.telegram.sendMessage(
          Number(user.telegramId),
          `❌ Your deposit of ${deposit.amount.format()} could not be verified.\n\n` +
            `If you believe this is a mistake, please contact support with your receipt.`,
        );
      }
    } catch (error) {
      logger.error({ err: error, depositId }, 'Deposit rejection failed');
      await ctx.answerCbQuery('Failed');
      await ctx.reply(toUserMessage(error));
    }
  });

  bot.command('pending', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const pending = await repositories.deposits.listByStatus('PENDING', 20);
    if (pending.length === 0) return ctx.reply('📭 No pending deposits.');

    const lines = pending.map(
      (deposit) => `• ${deposit.amount.format()} — \`${deposit.id}\`\n  ${deposit.createdAt.toISOString().slice(0, 16)}`,
    );

    await ctx.reply(`⏳ *${pending.length} pending deposit(s)*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  bot.command('prices', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const products = await repositories.products.listActive();
    if (products.length === 0) return ctx.reply('📭 No products. Run /sync first.');

    const lines = products.map((product) => {
      const supply = hasUnlimitedStock(product) ? 'stock ∞' : `stock ${product.stock}`;

      return (
        `${product.priceOverride ? '📌' : '🔄'} \`${product.slug}\`\n` +
        `   ${product.name}\n` +
        `   ${product.costPriceETB} ETB cost → *${product.sellingPrice.format()}*  ${supply}`
      );
    });

    await ctx.reply(
      `💵 *Prices* (📌 fixed · 🔄 auto)\n\n${lines.join('\n')}\n\n` +
        `Set one: \`/setprice <slug> <birr>\`\nBack to auto: \`/autoprice <slug>\``,
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('setprice', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const [, slug, amount] = ctx.message.text.trim().split(/\s+/);
    if (!slug || !amount || !/^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, ''))) {
      return ctx.reply(
        'Usage: `/setprice <slug> <birr>`\nExample: `/setprice google-ai-pro 2500`\n\nSee /prices for slugs.',
        { parse_mode: 'Markdown' },
      );
    }

    try {
      const result = await useCases.setProductPrice.execute({
        slugOrId: slug,
        priceETB: amount.replace(/,/g, ''),
      });

      await ctx.reply(
        `✅ *${result.product.name}*\n\n` +
          `Price: ${result.previousPrice.format()} → *${result.product.sellingPrice.format()}*\n` +
          `YeneShop cost: ${Money.fromDecimal(result.product.costPriceETB).format()} ` +
          `(suggested retail ${result.computedPrice.format()})\n\n` +
          `📌 Fixed — YeneShop catalogue refreshes will not overwrite it.\n` +
          `Revert with \`/autoprice ${result.product.slug}\`.`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      logger.warn({ err: error, slug }, 'Set price failed');
      await ctx.reply(toUserMessage(error));
    }
  });

  bot.command('autoprice', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const [, slug] = ctx.message.text.trim().split(/\s+/);
    if (!slug) {
      return ctx.reply('Usage: `/autoprice <slug>`', { parse_mode: 'Markdown' });
    }

    try {
      const result = await useCases.setProductPrice.execute({ slugOrId: slug, priceETB: null });

      await ctx.reply(
        `🔄 *${result.product.name}* is back to automatic pricing.\n\n` +
          `Price: ${result.previousPrice.format()} → *${result.product.sellingPrice.format()}*`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      logger.warn({ err: error, slug }, 'Auto price failed');
      await ctx.reply(toUserMessage(error));
    }
  });

  bot.command('setinstructions', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const text = ctx.message.text.replace(/^\/setinstructions\s*/, '').trim();
    if (!text) {
      return ctx.reply('Usage: `/setinstructions Telebirr: 09... / CBE: 100...`', { parse_mode: 'Markdown' });
    }

    await repositories.config.set(CONFIG_KEYS.depositInstructions, text);
    await ctx.reply('✅ Deposit instructions updated.');
  });

  bot.command('sync', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    await ctx.reply('🔄 Syncing products from YeneShop…');
    try {
      const result = await useCases.syncProducts.execute();
      await ctx.reply(
        `✅ Synced ${result.synced} product(s), deactivated ${result.deactivated}.`,
      );
    } catch (error) {
      logger.error({ err: error }, 'Manual sync failed');
      await ctx.reply(`❌ Sync failed: ${(error as Error).message}`);
    }
  });

  bot.command('credit', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const [, telegramId, amount] = ctx.message.text.split(/\s+/);
    if (!telegramId || !amount || !/^-?\d+(\.\d{1,2})?$/.test(amount)) {
      return ctx.reply('Usage: `/credit <telegramId> <amount>` (negative to debit)', { parse_mode: 'Markdown' });
    }

    try {
      const user = await repositories.users.findByTelegramId(BigInt(telegramId));
      if (!user) return ctx.reply('❓ No such user.');

      const updated = await repositories.users.adjustBalance(user.id, Money.fromDecimal(amount), {
        actorTelegramId: BigInt(ctx.from.id),
        adjustmentId: `${ctx.chat.id}:${ctx.message.message_id}`,
      });
      await ctx.reply(`✅ Adjusted. New balance: ${updated.balance.format()}`);

      await bot.telegram.sendMessage(
        Number(user.telegramId),
        `💰 An administrator adjusted your balance. New balance: *${updated.balance.format()}*`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      logger.error({ err: error }, 'Manual credit failed');
      await ctx.reply(toUserMessage(error));
    }
  });

  /**
   * Broadcast: an admin sending a photo (outside the deposit flow, which claims
   * receipts first) is offered a one-tap fan-out of that image to every user.
   * A confirmation stands between a stray screenshot and the whole user base.
   */
  bot.on('photo', async (ctx, next) => {
    // Anyone else's stray photo is not ours to act on — let it fall through.
    if (!ctx.isAdmin) return next();

    const recipients = await repositories.users.listBroadcastRecipients();
    if (recipients.length === 0) return ctx.reply('📭 No users to broadcast to yet.');

    await ctx.reply(
      `📢 *Broadcast this image?*\n\n` +
        `It will be copied — with any caption — to *${recipients.length}* user(s).\n` +
        `This cannot be undone.`,
      { parse_mode: 'Markdown', ...broadcastConfirmKeyboard(ctx.message.message_id) },
    );
  });

  bot.action(/^broadcast:(\d+)$/, async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const sourceMessageId = Number(ctx.match[1]);
    const sourceChatId = ctx.chat?.id;
    if (!sourceChatId) return;

    await ctx.answerCbQuery('Broadcasting…');
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);

    const recipients = await repositories.users.listBroadcastRecipients();
    let delivered = 0;
    let failed = 0;

    for (const telegramId of recipients) {
      const target = Number(telegramId);
      // No point echoing the broadcast back to the admin who just sent it.
      if (target === ctx.from?.id) continue;

      try {
        // copyMessage carries the photo and caption without a "forwarded from"
        // header, so it reads as a message from the shop rather than a forward.
        await bot.telegram.copyMessage(target, sourceChatId, sourceMessageId);
        delivered += 1;
      } catch (error) {
        // A user who blocked the bot or deleted their account must not stall
        // the rest of the run — count it and move on.
        failed += 1;
        logger.debug({ err: error, target }, 'Broadcast delivery failed');
      }

      // Stay under Telegram's ~30 messages/second broadcast ceiling.
      await sleep(40);
    }

    logger.info({ delivered, failed, by: ctx.from?.id }, 'Broadcast complete');
    await ctx.reply(
      `📢 *Broadcast sent.*\n\n` +
        `✅ Delivered: ${delivered}\n` +
        (failed > 0 ? `⚠️ Failed: ${failed}` : ''),
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('stats', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const [products, pending] = await Promise.all([
      repositories.products.listActive(),
      repositories.deposits.listByStatus('PENDING', 100),
    ]);

    let resellerBalance = 'unavailable';
    try {
      resellerBalance = Money.fromDecimal(
        await container.services.yeneshop.getResellerBalanceETB(),
      ).format();
    } catch {
      // Non-fatal: stats should still render if YeneShop is unreachable.
    }

    await ctx.reply(
      `📊 *Store status*\n\n` +
        `Active products: ${products.length}\n` +
        `Pending deposits: ${pending.length}\n` +
        `YeneShop reseller balance: ${resellerBalance}`,
      { parse_mode: 'Markdown' },
    );
  });
}
