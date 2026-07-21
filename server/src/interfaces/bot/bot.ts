import { session, Telegraf } from 'telegraf';

import type { Container } from '../../shared/container.js';
import { registerAdminCommands } from './commands/admin.js';
import { registerBasicCommands } from './commands/basic.js';
import { registerDepositFlow } from './commands/deposit.js';
import type { BotContext, SessionData } from './context.js';
import { toUserMessage } from './errorMessages.js';

export function createBot(container: Container): Telegraf<BotContext> {
  const bot = container.bot as unknown as Telegraf<BotContext>;
  const { logger, config, repositories } = container;
  const adminIds = new Set(config.ADMIN_TELEGRAM_IDS.map((id) => id.toString()));

  bot.use(session({ defaultSession: (): SessionData => ({}) }));

  // Identity middleware: attaches the caller's User row and admin flag.
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();

    ctx.isAdmin = adminIds.has(String(ctx.from.id));

    const user = await repositories.users.findByTelegramId(BigInt(ctx.from.id));
    if (user) ctx.user = user;

    return next();
  });

  // Timing + error boundary. A handler throwing must never kill the process.
  bot.use(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      await next();
    } catch (error) {
      logger.error({ err: error, updateType: ctx.updateType, from: ctx.from?.id }, 'Unhandled bot error');
      await ctx.reply(toUserMessage(error)).catch(() => undefined);
    } finally {
      logger.debug({ updateType: ctx.updateType, ms: Date.now() - startedAt }, 'Update handled');
    }
  });

  registerBasicCommands(bot, container);
  registerDepositFlow(bot, container);
  registerAdminCommands(bot, container);

  bot.catch((error, ctx) => {
    logger.error({ err: error, updateType: ctx.updateType }, 'Telegraf caught an error');
  });

  return bot;
}
