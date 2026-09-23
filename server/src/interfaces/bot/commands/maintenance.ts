import { Markup, type Telegraf } from 'telegraf';

import {
  DEFAULT_MAINTENANCE_MESSAGE,
  getMaintenance,
  setMaintenance,
  type MaintenanceState,
} from '../../../core/maintenance.js';
import type { Container } from '../../../shared/container.js';
import type { BotContext } from '../context.js';

/**
 * `/maintenance` — the admin's on/off switch for the shop.
 *
 * The panel toggles the mode and starts a short two-step flow (image, then
 * message) for setting what everyone sees while it is on. The flow's photo and
 * text steps are registered here and fall through (`next()`) when idle, so they
 * sit harmlessly ahead of the broadcast and deposit handlers.
 */
export function registerMaintenance(bot: Telegraf<BotContext>, container: Container): void {
  const { repositories, logger } = container;
  const config = repositories.config;

  const statusCard = (state: MaintenanceState): string =>
    `🛠 *Maintenance mode*\n\n` +
    `Status: ${state.enabled ? '🟢 *ON*' : '⚪️ *OFF*'}\n` +
    `Message: ${state.message ? `“${state.message}”` : '_default_'}\n` +
    `Image: ${state.imageFileId ? '✅ set' : '— none'}`;

  const panelKeyboard = (state: MaintenanceState) =>
    Markup.inlineKeyboard([
      [
        state.enabled
          ? Markup.button.callback('⚪️ Turn OFF', 'maint:off')
          : Markup.button.callback('🟢 Turn ON', 'maint:on'),
      ],
      [Markup.button.callback('✏️ Set image & message', 'maint:edit')],
      [Markup.button.callback('↩️ Close', 'cancel')],
    ]);

  const showPanel = async (ctx: BotContext): Promise<void> => {
    const state = await getMaintenance(config);
    await ctx.reply(statusCard(state), { parse_mode: 'Markdown', ...panelKeyboard(state) });
  };

  bot.command('maintenance', async (ctx) => {
    // Non-admins are already stopped by the gate; stay silent for them here.
    if (!ctx.isAdmin) return;
    await showPanel(ctx);
  });

  bot.action('maint:on', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('Not authorised');

    const state = await setMaintenance(config, { enabled: true });
    logger.warn({ by: ctx.from?.id }, 'Maintenance mode turned ON');
    await ctx.answerCbQuery('Maintenance ON');
    await ctx.editMessageText(statusCard(state), { parse_mode: 'Markdown', ...panelKeyboard(state) });
  });

  bot.action('maint:off', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('Not authorised');

    const state = await setMaintenance(config, { enabled: false });
    logger.warn({ by: ctx.from?.id }, 'Maintenance mode turned OFF');
    await ctx.answerCbQuery('Maintenance OFF');
    await ctx.editMessageText(statusCard(state), { parse_mode: 'Markdown', ...panelKeyboard(state) });
  });

  // --- the two-step "set image & message" flow --------------------------

  const askForImage = async (ctx: BotContext): Promise<void> => {
    ctx.session.awaitingMaintenanceImage = true;
    ctx.session.awaitingMaintenanceMessage = false;
    delete ctx.session.pendingMaintenanceImage;

    await ctx.reply(
      '🖼 Send the *image* to show during maintenance.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⏭ Keep current', 'maint:img:keep')],
          [Markup.button.callback('🚫 No image', 'maint:img:none')],
          [Markup.button.callback('↩️ Cancel', 'maint:cancel')],
        ]),
      },
    );
  };

  const askForMessage = async (ctx: BotContext): Promise<void> => {
    ctx.session.awaitingMaintenanceImage = false;
    ctx.session.awaitingMaintenanceMessage = true;

    await ctx.reply(
      '✍️ Now send the *message* users will see.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⏭ Keep current', 'maint:msg:keep')],
          [Markup.button.callback('↩️ Cancel', 'maint:cancel')],
        ]),
      },
    );
  };

  /**
   * Persists the flow's choices and turns maintenance on. `message === undefined`
   * keeps the stored message; the image decision rides in the session per the
   * sentinel documented on `pendingMaintenanceImage`.
   */
  const finalize = async (ctx: BotContext, message: string | null | undefined): Promise<void> => {
    const patch: Partial<MaintenanceState> = { enabled: true };
    if (message !== undefined) patch.message = message;

    const image = ctx.session.pendingMaintenanceImage;
    if (image !== undefined) patch.imageFileId = image === '' ? null : image;

    const state = await setMaintenance(config, patch);
    ctx.session = {};
    logger.warn({ by: ctx.from?.id }, 'Maintenance notice updated and turned ON');

    await ctx.reply('✅ Maintenance notice saved and turned *ON*.', { parse_mode: 'Markdown' });
    await ctx.reply(statusCard(state), { parse_mode: 'Markdown', ...panelKeyboard(state) });
  };

  bot.action('maint:edit', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('Not authorised');

    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await askForImage(ctx);
  });

  bot.action('maint:img:keep', async (ctx) => {
    if (!ctx.session.awaitingMaintenanceImage) return ctx.answerCbQuery();
    // Leaving pendingMaintenanceImage unset means "keep the current image".
    await ctx.answerCbQuery('Keeping current image');
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await askForMessage(ctx);
  });

  bot.action('maint:img:none', async (ctx) => {
    if (!ctx.session.awaitingMaintenanceImage) return ctx.answerCbQuery();
    ctx.session.pendingMaintenanceImage = '';
    await ctx.answerCbQuery('Removing image');
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await askForMessage(ctx);
  });

  bot.action('maint:msg:keep', async (ctx) => {
    if (!ctx.session.awaitingMaintenanceMessage) return ctx.answerCbQuery();
    await ctx.answerCbQuery('Keeping current message');
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await finalize(ctx, undefined);
  });

  bot.action('maint:cancel', async (ctx) => {
    ctx.session = {};
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageText('↩️ Cancelled.').catch(() => undefined);
  });

  // Step 1 — the image. Idle unless the flow asked for one.
  bot.on('photo', async (ctx, next) => {
    if (!ctx.session.awaitingMaintenanceImage) return next();

    const photo = ctx.message.photo.at(-1);
    if (!photo) return ctx.reply('⚠️ Could not read that image. Please try again.');

    try {
      const link = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(link);
      if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}`);
      ctx.session.pendingMaintenanceImage = await container.services.receipts.save(
        Buffer.from(await response.arrayBuffer()),
      );
      await askForMessage(ctx);
    } catch (error) {
      logger.warn({ err: error }, 'Could not store maintenance image');
      await ctx.reply('⚠️ Could not store that image. Please try again.');
    }
  });

  // Step 2 — the message. Idle unless the flow asked for one.
  bot.on('text', async (ctx, next) => {
    if (!ctx.session.awaitingMaintenanceMessage) return next();

    const text = ctx.message.text.trim();
    await finalize(ctx, text || null);
  });
}
