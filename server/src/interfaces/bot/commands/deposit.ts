import type { Telegraf } from 'telegraf';

import { CONFIG_KEYS } from '../../../core/constants.js';
import { paymentMethodsAsMarkdown } from '../../../core/paymentMethods.js';
import { MAX_DEPOSIT } from '../../../use-cases/deposit/RequestDepositUseCase.js';
import type { Container } from '../../../shared/container.js';
import type { BotContext } from '../context.js';
import { toUserMessage } from '../errorMessages.js';

// Shared with the web app's wallet screen so the two cannot disagree.
const DEFAULT_INSTRUCTIONS = paymentMethodsAsMarkdown();

export function registerDepositFlow(bot: Telegraf<BotContext>, container: Container): void {
  const { useCases, repositories, logger } = container;

  bot.hears(['➕ Deposit', '/deposit'], async (ctx) => {
    if (!ctx.user) return ctx.reply('👋 Please send /start first.');

    const instructions = (await repositories.config.get(CONFIG_KEYS.depositInstructions)) ?? DEFAULT_INSTRUCTIONS;
    const minimum = await useCases.requestDeposit.minimumDeposit();

    ctx.session.awaitingDepositAmount = true;
    ctx.session.awaitingReceipt = false;
    delete ctx.session.pendingDepositAmount;

    await ctx.reply(
      `➕ *Deposit*\n\n${instructions}\n\n` +
        `First, how much are you depositing (in ETB)?\n` +
        `Minimum ${minimum.format()}, maximum ${MAX_DEPOSIT.format()}.\n\n` +
        `Send /cancel to abort.`,
      { parse_mode: 'Markdown' },
    );
  });

  bot.command('cancel', async (ctx) => {
    ctx.session = {};
    await ctx.reply('↩️ Cancelled.');
  });

  // Step 1 — the amount.
  bot.on('text', async (ctx, next) => {
    if (!ctx.session.awaitingDepositAmount || !ctx.user) return next();

    const raw = ctx.message.text.trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      return ctx.reply('⚠️ Please send a plain number, e.g. `500`.', { parse_mode: 'Markdown' });
    }

    ctx.session.awaitingDepositAmount = false;
    ctx.session.pendingDepositAmount = raw;
    ctx.session.awaitingReceipt = true;

    await ctx.reply(`📸 Now send a *photo* of your payment receipt for ${raw} ETB.`, {
      parse_mode: 'Markdown',
    });
  });

  // Step 2 — the receipt screenshot.
  bot.on('photo', async (ctx, next) => {
    if (!ctx.session.awaitingReceipt || !ctx.user) return next();

    const amount = ctx.session.pendingDepositAmount;
    if (!amount) {
      ctx.session = {};
      return ctx.reply('⚠️ Something got out of sync. Please start again with ➕ Deposit.');
    }

    // Telegram sends several sizes; the last is the highest resolution.
    const photo = ctx.message.photo.at(-1);
    if (!photo) return ctx.reply('⚠️ Could not read that image. Please try again.');

    try {
      const deposit = await useCases.requestDeposit.execute({
        userId: ctx.user.id,
        amountETB: amount,
        screenshotUrl: photo.file_id,
      });

      ctx.session = {};

      await ctx.reply(
        `✅ Deposit request received.\n\n` +
          `Amount: *${deposit.amount.format()}*\n` +
          `Status: ⏳ Pending admin approval\n\n` +
          `You will be notified as soon as it is reviewed.`,
        { parse_mode: 'Markdown' },
      );

      // Same notifier the web API uses, so both deposit paths present the
      // identical review card to admins.
      await container.services.depositNotifier.notifyNewDeposit({
        depositId: deposit.id,
        amountLabel: deposit.amount.format(),
        user: {
          telegramId: ctx.user.telegramId,
          firstName: ctx.user.firstName,
          username: ctx.user.username,
        },
        photo: { fileId: photo.file_id },
      });
    } catch (error) {
      logger.warn({ err: error, userId: ctx.user.id }, 'Deposit request failed');
      ctx.session = {};
      await ctx.reply(toUserMessage(error));
    }
  });
}
