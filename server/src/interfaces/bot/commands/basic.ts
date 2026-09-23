import type { Telegraf } from 'telegraf';

import type { Container } from '../../../shared/container.js';
import type { BotContext } from '../context.js';
import { openMiniAppKeyboard } from '../keyboards/menus.js';

/**
 * Suq's customer experience lives entirely in the Telegram Mini App. The bot
 * is only the trusted launch surface; registration and every customer action
 * begin after Telegram initData is confirmed by the web API. The one Web App
 * action is attached to the welcome message, not left as a persistent chat
 * keyboard.
 */
export function registerBasicCommands(bot: Telegraf<BotContext>, container: Container): void {
  const openKeyboard = openMiniAppKeyboard(container.config.WEB_APP_URL);

  bot.start(async (ctx) => {
    await ctx.reply(
      'Welcome to Atke Digital Shop!\n\nOpen the Mini App to browse products, manage your wallet and view your orders.',
      openKeyboard,
    );
  });
}
