import type { Telegraf } from 'telegraf';

import { CONFIG_KEYS } from '../../../core/constants.js';
import { Money } from '../../../core/entities/Money.js';
import type { Container } from '../../../shared/container.js';
import type { BotContext } from '../context.js';
import { toUserMessage } from '../errorMessages.js';

export function registerAdminCommands(bot: Telegraf<BotContext>, container: Container): void {
  const { useCases, repositories, config, logger } = container;

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

  bot.command('setrate', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const value = ctx.message.text.split(/\s+/)[1];
    if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) {
      const current = (await repositories.config.get(CONFIG_KEYS.usdtEtbRate)) ?? String(config.DEFAULT_USDT_ETB_RATE);
      return ctx.reply(`Current rate: *${current}* ETB per USDT.\n\nUsage: \`/setrate 165.50\``, {
        parse_mode: 'Markdown',
      });
    }

    await repositories.config.set(CONFIG_KEYS.usdtEtbRate, value);
    // Prices are only recomputed on sync, so run one now to avoid a stale catalogue.
    const result = await useCases.syncProducts.execute();

    await ctx.reply(`✅ Rate set to *${value}* ETB/USDT. Repriced ${result.synced} product(s).`, {
      parse_mode: 'Markdown',
    });
  });

  bot.command('prices', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const products = await repositories.products.listActive();
    if (products.length === 0) return ctx.reply('📭 No products. Run /sync first.');

    const lines = products.map(
      (product) =>
        `${product.priceOverride ? '📌' : '🔄'} \`${product.slug}\`\n` +
        `   ${product.name}\n` +
        `   ${product.costPriceUSDT} USDT → *${product.sellingPrice.format()}*  stock ${product.stock}`,
    );

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
          `Cost: ${result.product.costPriceUSDT} USDT (auto price would be ${result.computedPrice.format()})\n\n` +
          `📌 Fixed — it will not move when the USDT rate changes.\n` +
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

    await ctx.reply('🔄 Syncing products from HubX…');
    try {
      const result = await useCases.syncProducts.execute();
      await ctx.reply(
        `✅ Synced ${result.synced} product(s), deactivated ${result.deactivated}. Rate: ${result.rate} ETB/USDT.`,
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

      const updated = await repositories.users.adjustBalance(user.id, Money.fromDecimal(amount));
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

  bot.command('stats', async (ctx) => {
    if (!(await requireAdmin(ctx))) return;

    const [products, pending] = await Promise.all([
      repositories.products.listActive(),
      repositories.deposits.listByStatus('PENDING', 100),
    ]);

    let resellerBalance = 'unavailable';
    try {
      resellerBalance = `${await container.services.hubx.getResellerBalanceUSDT()} USDT`;
    } catch {
      // Non-fatal: stats should still render if HubX is unreachable.
    }

    await ctx.reply(
      `📊 *Store status*\n\n` +
        `Active products: ${products.length}\n` +
        `Pending deposits: ${pending.length}\n` +
        `HubX balance: ${resellerBalance}`,
      { parse_mode: 'Markdown' },
    );
  });
}
