import type { Telegraf } from 'telegraf';

import { productDetails } from '../../../core/entities/Product.js';
import { escapeHtml } from '../html.js';
import type { Container } from '../../../shared/container.js';
import type { BotContext } from '../context.js';
import { toUserMessage } from '../errorMessages.js';
import { mainMenu, productListKeyboard, confirmPurchaseKeyboard } from '../keyboards/menus.js';

export function registerBasicCommands(bot: Telegraf<BotContext>, container: Container): void {
  const { useCases, repositories, logger } = container;

  /**
   * Onboarding stays 1-click: no phone number is requested, and a failed
   * avatar lookup is swallowed rather than allowed to block /start.
   */
  const fetchAvatarFileId = async (telegramId: number): Promise<string | null> => {
    try {
      const photos = await bot.telegram.getUserProfilePhotos(telegramId, 0, 1);
      // Sizes ascend; the last entry is the highest resolution.
      return photos.photos[0]?.at(-1)?.file_id ?? null;
    } catch (error) {
      logger.debug({ err: error, telegramId }, 'Could not read profile photo');
      return null;
    }
  };

  bot.start(async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const user = await useCases.registerUser.execute({
      telegramId: BigInt(from.id),
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      avatarUrl: await fetchAvatarFileId(from.id),
    });

    await ctx.reply(
      `👋 Welcome${user.firstName ? `, ${user.firstName}` : ''}!\n\n` +
        `This is YeneShop — buy digital products instantly with your ETB wallet.\n\n` +
        `💰 Balance: ${user.balance.format()}\n\n` +
        `Use the menu below to get started.`,
      mainMenu,
    );
  });

  bot.hears(['💰 Balance', '/balance'], async (ctx) => {
    if (!ctx.user) return ctx.reply('👋 Please send /start first.');

    await ctx.reply(`💰 Your balance: *${ctx.user.balance.format()}*`, { parse_mode: 'Markdown' });
  });

  bot.hears(['🛒 Products', '/products'], async (ctx) => {
    const products = await useCases.listProducts.execute();

    if (products.length === 0) {
      return ctx.reply('📭 No products are available right now. Please check back soon.');
    }

    await ctx.reply('🏪 *Shop Deals*\n\n👇 Tap a product to view details.', {
      parse_mode: 'Markdown',
      ...productListKeyboard(products),
    });
  });

  bot.hears(['📦 My Orders', '/orders'], async (ctx) => {
    if (!ctx.user) return ctx.reply('👋 Please send /start first.');

    const orders = await repositories.orders.listByUser(ctx.user.id, 10);
    if (orders.length === 0) return ctx.reply('📦 You have no orders yet.');

    const lines = orders.map((order) => {
      const icon = order.status === 'COMPLETED' ? '✅' : order.status === 'REFUNDED' ? '↩️' : '⏳';
      return `${icon} ${order.productName} — ${order.pricePaid.format()}\n   ${order.createdAt.toISOString().slice(0, 16).replace('T', ' ')} · ${order.status}`;
    });

    await ctx.reply(`📦 *Your last ${orders.length} orders*\n\n${lines.join('\n\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  bot.hears(['ℹ️ Help', '/help'], async (ctx) => {
    await ctx.reply(
      'ℹ️ *How it works*\n\n' +
        '1. Tap ➕ Deposit and follow the steps to fund your wallet.\n' +
        '2. An admin verifies your receipt — usually within a few minutes.\n' +
        '3. Browse 🛒 Products and buy instantly with your balance.\n\n' +
        'Your purchased items are delivered right here in this chat.',
      { parse_mode: 'Markdown' },
    );
  });

  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery('This product is out of stock.');
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageText('↩️ Cancelled.');
  });

  bot.action(/^product:(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    if (!productId) return ctx.answerCbQuery();

    const product = await repositories.products.findById(productId);
    if (!product) {
      await ctx.answerCbQuery('No longer available');
      return;
    }

    await ctx.answerCbQuery();

    const details = productDetails(product);
    const stockLine =
      product.stock > 0 ? `📦 In stock: <b>${product.stock}</b>` : '📦 <b>Out of stock</b>';

    // HTML rather than Markdown: product copy is full of _ * ( ) and URLs that
    // Telegram's Markdown parser rejects.
    await ctx.reply(
      `<b>${escapeHtml(product.name)}</b>\n\n` +
        (details ? `${escapeHtml(details)}\n\n` : '') +
        `💵 Price: <b>${escapeHtml(product.sellingPrice.format())}</b>\n` +
        stockLine,
      { parse_mode: 'HTML', ...confirmPurchaseKeyboard(product.id) },
    );
  });

  bot.action(/^buy:(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    if (!productId || !ctx.user) {
      await ctx.answerCbQuery('Please send /start first.');
      return;
    }

    await ctx.answerCbQuery('Processing…');
    // Remove the buttons immediately so an impatient double-tap cannot queue a
    // second purchase while the first is still in flight.
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);

    try {
      const result = await useCases.placeOrder.execute({
        userId: ctx.user.id,
        productId,
      });

      const items = result.deliveredItems
        .map((item) => '`' + JSON.stringify(item, null, 2) + '`')
        .join('\n\n');

      await ctx.reply(
        `✅ *Purchase complete!*\n\n` +
          `${result.productName}\n` +
          `Paid: ${result.pricePaid.format()}\n` +
          `💰 Remaining balance: ${result.newBalance.format()}\n\n` +
          `🎁 *Your item(s):*\n${items || '_Delivery pending — contact support if it does not arrive._'}`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      logger.warn({ err: error, userId: ctx.user.id, productId }, 'Purchase failed');
      await ctx.reply(toUserMessage(error));
    }
  });
}
