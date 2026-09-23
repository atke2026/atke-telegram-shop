import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { CACHE_KEYS } from '../../core/constants.js';
import { Money } from '../../core/entities/Money.js';
import { hasUnlimitedStock, productDetails } from '../../core/entities/Product.js';
import type { User } from '../../core/entities/User.js';
import { isDiscountLive } from '../../core/entities/Discount.js';
import {
  getMaintenance,
  maintenanceImageUrl,
  setMaintenance,
  type MaintenanceState,
} from '../../core/maintenance.js';
import type { LogoBackground } from '../../infrastructure/storage/LogoStorage.js';
import { isStoredReceipt, UnsupportedImageError } from '../../infrastructure/storage/ReceiptStorage.js';
import {
  MoneyAnalytics,
  parseAnalyticsDateRange,
  todayInAnalyticsTimezone,
} from '../../infrastructure/database/MoneyAnalytics.js';
import { NotAnAdminError } from '../../use-cases/admin/ManageAdminsUseCase.js';
import type { Container } from '../../shared/container.js';
import { toDepositDto, toOrderDto, toProductDto } from './serializers.js';

/**
 * Everything under /api/admin.
 *
 * Authorisation is enforced here, per request, against the admins table — the
 * caller's telegramId comes from initData that was already HMAC-verified, so
 * it cannot be spoofed by the client. The web app also hides the Panel tab for
 * non-admins, but that is cosmetic: these checks are the real boundary.
 */
export function registerAdminRoutes(app: FastifyInstance, container: Container): void {
  const { repositories, useCases, services, logger, bot } = container;
  const moneyAnalytics = new MoneyAnalytics(container.prisma, services.yeneshop);

  const requireAdmin = async (request: FastifyRequest): Promise<User> => {
    const user = request.currentUser;
    if (!user) throw new NotAnAdminError();

    if (!(await useCases.manageAdmins.isAdmin(user.telegramId))) {
      logger.warn(
        { telegramId: user.telegramId.toString(), url: request.url },
        'Rejected non-admin request to the admin API',
      );
      throw new NotAnAdminError();
    }

    return user;
  };

  const requireBackupOwner = async (request: FastifyRequest): Promise<User> => {
    const admin = await requireAdmin(request);
    if (!container.config.ADMIN_TELEGRAM_IDS.some((id) => id === admin.telegramId)) {
      throw new NotAnAdminError();
    }
    return admin;
  };

  // --- full backups -----------------------------------------------------

  app.get('/api/admin/backups', async (request) => {
    const admin = await requireAdmin(request);
    return {
      ...(await services.backups.status()),
      canRestore: container.config.ADMIN_TELEGRAM_IDS.some((id) => id === admin.telegramId),
    };
  });

  app.post('/api/admin/backups/schedule', async (request) => {
    await requireAdmin(request);
    const body = request.body as { intervalHours?: unknown } | undefined;
    const intervalHours =
      body?.intervalHours === null
        ? null
        : typeof body?.intervalHours === 'number'
          ? body.intervalHours
          : Number.NaN;
    return services.backups.setIntervalHours(intervalHours);
  });

  app.post('/api/admin/backups', async (request) => {
    const admin = await requireAdmin(request);
    return services.backups.createManualBackup(admin.telegramId);
  });

  app.get('/api/admin/backups/:name/download', async (request, reply) => {
    await requireAdmin(request);
    const { name } = request.params as { name: string };
    const archive = services.backups.resolveArchive(name);

    return reply
      .header('Content-Type', 'application/gzip')
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .header('Cache-Control', 'private, no-store')
      .send(createReadStream(archive));
  });

  app.post('/api/admin/backups/:name/restore', async (request, reply) => {
    const admin = await requireBackupOwner(request);
    const { name } = request.params as { name: string };
    const body = request.body as { confirmation?: unknown } | undefined;
    if (body?.confirmation !== 'RESTORE') {
      return reply.code(400).send({
        error: 'RESTORE_CONFIRMATION_REQUIRED',
        message: 'Type RESTORE to confirm the full restore.',
      });
    }
    return services.backups.restoreStored(name, admin.telegramId);
  });

  app.post('/api/admin/backups/import', async (request, reply) => {
    const admin = await requireBackupOwner(request);
    if (request.headers['x-backup-confirmation'] !== 'RESTORE') {
      return reply.code(400).send({
        error: 'RESTORE_CONFIRMATION_REQUIRED',
        message: 'Type RESTORE to confirm the full restore.',
      });
    }

    const body = request.body as Readable | undefined;
    if (!body || typeof body.pipe !== 'function') {
      return reply.code(400).send({
        error: 'BACKUP_FILE_REQUIRED',
        message: 'Choose a Suq backup archive to restore.',
      });
    }
    const rawLength = request.headers['content-length'];
    const contentLength =
      typeof rawLength === 'string' && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;
    const imported = await services.backups.saveImport(body, contentLength);
    return services.backups.restoreImported(imported, admin.telegramId);
  });

  // --- overview ---------------------------------------------------------

  app.get('/api/admin/summary', async (request) => {
    await requireAdmin(request);

    const [products, pendingDeposits] = await Promise.all([
      repositories.products.listActive(),
      repositories.deposits.listByStatus('PENDING', 200),
    ]);

    let resellerBalance: string | null = null;
    try {
      resellerBalance = await services.yeneshop.getResellerBalanceETB();
    } catch {
      // The panel must still render when YeneShop is unreachable.
    }

    const pendingTotal = pendingDeposits.reduce(
      (total, deposit) => total.add(deposit.amount),
      Money.ZERO,
    );

    return {
      products: {
        active: products.length,
        outOfStock: products.filter((product) => !product.operatorAvailable || product.stock === 0)
          .length,
      },
      deposits: {
        pending: pendingDeposits.length,
        pendingTotal: { amount: pendingTotal.toDecimalString(), label: pendingTotal.format() },
      },
      yeneshop: {
        balance: resellerBalance === null
          ? null
          : { amount: resellerBalance, label: Money.fromDecimal(resellerBalance).format() },
      },
    };
  });

  // --- money analytics --------------------------------------------------

  app.get('/api/admin/analytics', async (request, reply) => {
    await requireAdmin(request);

    const query = request.query as { from?: string; to?: string };
    const today = todayInAnalyticsTimezone();
    const range = parseAnalyticsDateRange(query.from ?? today, query.to ?? today);
    if (!range) {
      return reply.code(400).send({
        error: 'INVALID_DATE_RANGE',
        message: 'Choose a valid start and end date.',
      });
    }

    return moneyAnalytics.get(range);
  });

  // --- maintenance ------------------------------------------------------

  const maintenanceDto = (state: MaintenanceState) => ({
    enabled: state.enabled,
    message: state.message,
    imageUrl: maintenanceImageUrl(state),
  });

  app.get('/api/admin/maintenance', async (request) => {
    await requireAdmin(request);
    return maintenanceDto(await getMaintenance(repositories.config));
  });

  app.post('/api/admin/maintenance', async (request) => {
    const admin = await requireAdmin(request);
    const body = request.body as { enabled?: unknown; message?: unknown } | undefined;

    const patch: Partial<MaintenanceState> = {};
    if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled;
    // Blank is the same as cleared: fall back to the default notice at display.
    if (body?.message === null) patch.message = null;
    else if (typeof body?.message === 'string') patch.message = body.message.trim() || null;

    const state = await setMaintenance(repositories.config, patch);
    logger.warn(
      { by: admin.telegramId.toString(), enabled: state.enabled },
      'Maintenance mode changed from the panel',
    );
    return maintenanceDto(state);
  });

  app.post('/api/admin/maintenance/image', async (request, reply) => {
    await requireAdmin(request);
    const body = request.body as { imageBase64?: unknown } | undefined;

    // Explicit null clears the current image.
    if (body?.imageBase64 === null) {
      return maintenanceDto(await setMaintenance(repositories.config, { imageFileId: null }));
    }

    if (typeof body?.imageBase64 !== 'string' || body.imageBase64.length === 0) {
      return reply.code(400).send({ error: 'imageBase64 is required' });
    }

    // Accepts a bare base64 payload or a data: URL from a file input.
    const base64 = body.imageBase64.replace(/^data:image\/[a-z+]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) return reply.code(400).send({ error: 'image is empty' });

    try {
      // Stored on disk beside the receipts; the public image route streams it,
      // and the bot sends it from the same buffer while the notice is on.
      const reference = await services.receipts.save(buffer);
      return maintenanceDto(await setMaintenance(repositories.config, { imageFileId: reference }));
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        return reply.code(400).send({ error: 'UNSUPPORTED_IMAGE', message: error.message });
      }
      throw error;
    }
  });

  // --- deposits ---------------------------------------------------------

  app.get('/api/admin/deposits', async (request) => {
    await requireAdmin(request);

    const { status } = request.query as { status?: string };
    const wanted = status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING';
    const deposits = await repositories.deposits.listByStatus(wanted, 100);

    // Admins review by person, so each row carries who it is from.
    const rows = await Promise.all(
      deposits.map(async (deposit) => {
        const user = await repositories.users.findById(deposit.userId);
        return {
          ...toDepositDto(deposit),
          // Only the earliest web uploads, made before receipts were stored,
          // have nothing to show.
          hasReceiptImage: deposit.screenshotUrl !== 'webapp-upload',
          user: user
            ? {
                telegramId: user.telegramId.toString(),
                firstName: user.firstName,
                username: user.username,
                balance: { amount: user.balance.toDecimalString(), label: user.balance.format() },
              }
            : null,
        };
      }),
    );

    return { deposits: rows };
  });

  /** Streams the receipt, resolving the Telegram file_id with the bot token. */
  app.get('/api/admin/deposits/:id/receipt', async (request, reply) => {
    await requireAdmin(request);

    const { id } = request.params as { id: string };
    const deposit = await repositories.deposits.findById(id);
    if (!deposit) return reply.code(404).send({ error: 'DEPOSIT_NOT_FOUND' });

    // Deposits made before receipts were stored have nothing on disk.
    if (deposit.screenshotUrl === 'webapp-upload') {
      return reply.code(404).send({ error: 'RECEIPT_NOT_STORED' });
    }

    if (isStoredReceipt(deposit.screenshotUrl)) {
      const stored = await services.receipts.read(deposit.screenshotUrl);
      if (!stored) return reply.code(404).send({ error: 'RECEIPT_NOT_FOUND' });

      return reply
        .header('Content-Type', stored.contentType)
        // Receipts are personal data: never let a shared cache keep a copy.
        .header('Cache-Control', 'private, max-age=300')
        .send(stored.buffer);
    }

    try {
      const link = await bot.telegram.getFileLink(deposit.screenshotUrl);
      const response = await fetch(link.toString());
      if (!response.ok) return reply.code(502).send({ error: 'RECEIPT_FETCH_FAILED' });

      const buffer = Buffer.from(await response.arrayBuffer());
      return reply
        .header('Content-Type', response.headers.get('content-type') ?? 'image/jpeg')
        // Receipts are personal data: never let a shared cache keep a copy.
        .header('Cache-Control', 'private, max-age=300')
        .send(buffer);
    } catch (error) {
      logger.error({ err: error, depositId: id }, 'Could not load receipt');
      return reply.code(502).send({ error: 'RECEIPT_FETCH_FAILED' });
    }
  });

  app.post('/api/admin/deposits/:id/approve', async (request) => {
    const admin = await requireAdmin(request);
    const { id } = request.params as { id: string };

    const { deposit, user } = await useCases.approveDeposit.execute({
      depositId: id,
      reviewerTelegramId: admin.telegramId,
    });

    await services.depositNotifier.notifyDepositReviewed({
      telegramId: user.telegramId,
      approved: true,
      amountLabel: deposit.amount.format(),
      newBalanceLabel: user.balance.format(),
    });

    return { deposit: toDepositDto(deposit), balance: user.balance.format() };
  });

  app.post('/api/admin/deposits/:id/reject', async (request) => {
    const admin = await requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { note?: unknown } | undefined;

    const deposit = await useCases.rejectDeposit.execute({
      depositId: id,
      reviewerTelegramId: admin.telegramId,
      ...(typeof body?.note === 'string' ? { note: body.note } : {}),
    });

    const user = await repositories.users.findById(deposit.userId);
    if (user) {
      await services.depositNotifier.notifyDepositReviewed({
        telegramId: user.telegramId,
        approved: false,
        amountLabel: deposit.amount.format(),
      });
    }

    return { deposit: toDepositDto(deposit) };
  });

  // --- products ---------------------------------------------------------

  app.get('/api/admin/products', async (request) => {
    await requireAdmin(request);

    // Deliberately the customer-facing order, not the alphabetical one: the
    // admin drags rows in this list, so it has to be the list being reordered.
    const entries = await useCases.listProducts.priced();
    return {
      products: entries.map(({ product, priced }) => ({
        ...toProductDto(product, priced),
        costPriceETB: product.costPriceETB,
        fixedPrice: product.priceOverride !== null,
        placed: product.sortOrder !== null,
        source: product.source,
        finiteStock: !hasUnlimitedStock(product),
        operatorAvailable: product.operatorAvailable,
      })),
    };
  });

  /**
   * Replaces the hand-picked order wholesale. The body is the full arrangement
   * of placed products, top first; anything omitted returns to the automatic
   * ranking.
   */
  app.post('/api/admin/products/order', async (request, reply) => {
    await requireAdmin(request);

    const body = request.body as { productIds?: unknown } | undefined;
    if (!Array.isArray(body?.productIds) || body.productIds.some((id) => typeof id !== 'string')) {
      return reply.code(400).send({ error: 'productIds must be an array of product ids' });
    }

    return useCases.reorderProducts.execute(body.productIds as string[]);
  });

  app.delete('/api/admin/products/order', async (request) => {
    await requireAdmin(request);
    return useCases.reorderProducts.reset();
  });

  /**
   * One deliberate admin action does both halves of "new arrival": position
   * the item first in every catalogue and announce the customer-facing price.
   */
  app.post('/api/admin/products/:slug/new-arrival', async (request) => {
    const admin = await requireAdmin(request);
    const { slug } = request.params as { slug: string };

    const result = await useCases.announceNewArrival.execute({
      slugOrId: slug,
      announcedByTelegramId: admin.telegramId,
    });

    logger.warn(
      {
        by: admin.telegramId.toString(),
        slug,
      },
      'New arrival promoted and announcement queued',
    );

    return result;
  });

  app.post('/api/admin/products/:slug/channel-stock', async (request) => {
    const admin = await requireAdmin(request);
    const { slug } = request.params as { slug: string };
    const result = await useCases.publishLowStock.execute(slug);

    logger.warn(
      {
        by: admin.telegramId.toString(),
        slug,
        stock: result.stock,
        channelMessageId: result.messageId,
      },
      'Low-stock product published to channel',
    );

    return result;
  });

  app.post('/api/admin/products/:slug/availability', async (request, reply) => {
    const admin = await requireAdmin(request);
    const { slug } = request.params as { slug: string };
    const body = request.body as { available?: unknown } | undefined;

    if (typeof body?.available !== 'boolean') {
      return reply.code(400).send({ error: 'available must be a boolean' });
    }

    const product = await useCases.setProductAvailability.execute({
      slugOrId: slug,
      available: body.available,
    });

    logger.warn(
      {
        by: admin.telegramId.toString(),
        slug: product.slug,
        operatorAvailable: product.operatorAvailable,
      },
      'YeneShop product availability changed',
    );

    return {
      product: toProductDto(product),
      operatorAvailable: product.operatorAvailable,
    };
  });

  app.post('/api/admin/products/:slug/price', async (request, reply) => {
    await requireAdmin(request);

    const { slug } = request.params as { slug: string };
    const body = request.body as { priceETB?: unknown } | undefined;

    // null clears the fixed price and returns the product to automatic pricing.
    const priceETB =
      body?.priceETB === null ? null : typeof body?.priceETB === 'string' ? body.priceETB : undefined;

    if (priceETB === undefined) {
      return reply.code(400).send({ error: 'priceETB must be a string, or null for automatic pricing' });
    }

    const result = await useCases.setProductPrice.execute({ slugOrId: slug, priceETB });
    return {
      product: toProductDto(result.product),
      previousPrice: result.previousPrice.format(),
      computedPrice: result.computedPrice.format(),
    };
  });

  /**
   * The product page shown before purchase and, since it is what the customer
   * needs to redeem what they bought, sent again after delivery. Stored as an
   * override so a catalogue sync never overwrites it.
   */
  app.post('/api/admin/products/:slug/instructions', async (request, reply) => {
    await requireAdmin(request);

    const { slug } = request.params as { slug: string };
    const body = request.body as { instructions?: unknown } | undefined;

    if (body?.instructions !== null && typeof body?.instructions !== 'string') {
      return reply.code(400).send({ error: 'instructions must be a string, or null to clear it' });
    }

    const product = await repositories.products.findBySlugOrId(slug);
    if (!product) return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });

    // Blank is the same as cleared: an empty page would otherwise be sent to
    // a customer as their redemption instructions.
    const trimmed = typeof body.instructions === 'string' ? body.instructions.trim() : null;
    const updated = await repositories.products.setDescription(product.id, trimmed || null);

    await services.cache.del(CACHE_KEYS.products);
    return { product: toProductDto(updated) };
  });

  app.post('/api/admin/products/:slug/logo', async (request, reply) => {
    await requireAdmin(request);

    const { slug } = request.params as { slug: string };
    const body = request.body as { imageBase64?: unknown; background?: unknown } | undefined;

    if (typeof body?.imageBase64 !== 'string' || body.imageBase64.length === 0) {
      return reply.code(400).send({ error: 'imageBase64 is required' });
    }

    // 'auto' measures whether the mark survives a dark theme without a plate.
    const background: LogoBackground =
      body.background === 'transparent' || body.background === 'white' ? body.background : 'auto';

    const product = await repositories.products.findBySlugOrId(slug);
    if (!product) return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });

    // Accepts a bare base64 payload or a data: URL from a file input.
    const base64 = body.imageBase64.replace(/^data:image\/[a-z+]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    try {
      // Named by the product's own slug, never the path parameter, so a
      // crafted request cannot choose the filename it writes.
      const saved = await services.logos.save(product.slug, buffer, background);

      // Only after the file is on disk: the version is what tells every
      // client the picture changed, so it must never run ahead of the write.
      const updated = await repositories.products.bumpLogoVersion(product.id);
      await services.cache.del(CACHE_KEYS.products);
      logger.info(
        {
          slug: product.slug,
          bytes: buffer.length,
          logoVersion: updated.logoVersion,
          background,
          transparent: saved.transparent,
        },
        'Product logo replaced',
      );

      // The panel says which way it went, so an automatic decision the
      // operator disagrees with is visible rather than a mystery.
      return { logoUrl: toProductDto(updated).logoUrl, transparent: saved.transparent };
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        return reply.code(400).send({ error: 'UNSUPPORTED_IMAGE', message: error.message });
      }
      throw error;
    }
  });

  app.post('/api/admin/sync', async (request) => {
    await requireAdmin(request);
    return useCases.syncProducts.execute();
  });

  // --- users ------------------------------------------------------------

  app.get('/api/admin/users', async (request) => {
    await requireAdmin(request);

    const { query, limit, offset } = request.query as {
      query?: string;
      limit?: string;
      offset?: string;
    };

    const result = await repositories.users.search({
      ...(query ? { query } : {}),
      // Capped so a crafted limit cannot ask for the whole table.
      limit: Math.min(Number(limit) || 30, 100),
      offset: Math.max(Number(offset) || 0, 0),
    });

    return {
      total: result.total,
      users: result.entries.map((entry) => ({
        id: entry.user.id,
        telegramId: entry.user.telegramId.toString(),
        firstName: entry.user.firstName,
        username: entry.user.username,
        isBanned: entry.user.isBanned,
        createdAt: entry.user.createdAt.toISOString(),
        balance: {
          amount: entry.user.balance.toDecimalString(),
          label: entry.user.balance.format(),
        },
        orderCount: entry.orderCount,
        totalSpent: { amount: entry.totalSpent.toDecimalString(), label: entry.totalSpent.format() },
      })),
    };
  });

  // --- feedback ---------------------------------------------------------

  app.get('/api/admin/feedback', async (request) => {
    await requireAdmin(request);

    const { limit, offset } = request.query as { limit?: string; offset?: string };

    const result = await repositories.feedback.list({
      // Capped like the user list, so a crafted limit cannot ask for the lot.
      limit: Math.min(Number(limit) || 30, 100),
      offset: Math.max(Number(offset) || 0, 0),
    });

    return {
      total: result.total,
      // Rounded to one decimal here rather than in the client, so the bot and
      // the panel would report the same headline figure.
      average: result.average === null ? null : Math.round(result.average * 10) / 10,
      entries: result.entries.map((entry) => ({
        id: entry.feedback.id,
        rating: entry.feedback.rating,
        createdAt: entry.feedback.createdAt.toISOString(),
        updatedAt: entry.feedback.updatedAt.toISOString(),
        user: {
          id: entry.user.id,
          telegramId: entry.user.telegramId.toString(),
          firstName: entry.user.firstName,
          username: entry.user.username,
          isBanned: entry.user.isBanned,
        },
      })),
    };
  });

  app.get('/api/admin/users/:telegramId', async (request, reply) => {
    await requireAdmin(request);

    const { telegramId } = request.params as { telegramId: string };
    if (!/^\d{1,20}$/.test(telegramId)) {
      return reply.code(400).send({ error: 'telegramId must be numeric' });
    }

    const user = await repositories.users.findByTelegramId(BigInt(telegramId));
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const [orders, deposits] = await Promise.all([
      repositories.orders.listByUser(user.id, 50),
      repositories.deposits.listByUser(user.id, 50),
    ]);

    const spent = orders
      .filter((order) => order.status === 'COMPLETED')
      .reduce((total, order) => total.add(order.pricePaid), Money.ZERO);

    const deposited = deposits
      .filter((deposit) => deposit.status === 'APPROVED')
      .reduce((total, deposit) => total.add(deposit.amount), Money.ZERO);

    return {
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        firstName: user.firstName,
        username: user.username,
        isBanned: user.isBanned,
        createdAt: user.createdAt.toISOString(),
        balance: { amount: user.balance.toDecimalString(), label: user.balance.format() },
      },
      totals: {
        spent: { amount: spent.toDecimalString(), label: spent.format() },
        deposited: { amount: deposited.toDecimalString(), label: deposited.format() },
        orderCount: orders.length,
        depositCount: deposits.length,
      },
      // The contents are withheld here on purpose — a support question is
      // almost always "did anything arrive?", which the count answers without
      // putting every customer's license keys in a routine list response.
      // Reading the items themselves is a separate, logged request below.
      //   null = never fulfilled, 0 = fulfilled but empty (upstream sent
      //   nothing), n = delivered.
      orders: orders.map((order) => ({
        ...toOrderDto(order),
        deliveredItems: null,
        deliveredItemCount: order.deliveredItems === null ? null : order.deliveredItems.length,
      })),
      deposits: deposits.map((deposit) => ({
        ...toDepositDto(deposit),
        hasReceiptImage: deposit.screenshotUrl !== 'webapp-upload',
      })),
    };
  });

  /**
   * The delivered contents of one order — license keys, links, credentials.
   *
   * Deliberately a separate call rather than a field on the user page: this is
   * the one place an admin can read what a customer bought, so every read is
   * logged with who asked and whose order it was.
   */
  app.get('/api/admin/orders/:orderId/items', async (request, reply) => {
    const admin = await requireAdmin(request);

    const { orderId } = request.params as { orderId: string };
    const order = await repositories.orders.findById(orderId);
    if (!order) return reply.code(404).send({ error: 'ORDER_NOT_FOUND' });

    logger.info(
      {
        adminTelegramId: admin.telegramId.toString(),
        orderId: order.id,
        customerId: order.userId,
        itemCount: order.deliveredItems?.length ?? 0,
      },
      'Admin read the delivered items of an order',
    );

    return {
      orderId: order.id,
      productName: order.productName,
      status: order.status,
      yeneshopOrderId: order.yeneshopOrderId,
      deliveredItems: order.deliveredItems ?? [],
    };
  });

  app.post('/api/admin/users/:telegramId/ban', async (request, reply) => {
    const admin = await requireAdmin(request);

    const { telegramId } = request.params as { telegramId: string };
    const body = request.body as { banned?: unknown } | undefined;
    if (typeof body?.banned !== 'boolean') {
      return reply.code(400).send({ error: 'banned must be true or false' });
    }

    if (!/^\d{1,20}$/.test(telegramId)) {
      return reply.code(400).send({ error: 'telegramId must be numeric' });
    }

    const user = await repositories.users.findByTelegramId(BigInt(telegramId));
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    // An admin locking themselves out of their own account helps nobody.
    if (user.telegramId === admin.telegramId) {
      return reply.code(409).send({ error: 'You cannot ban your own account' });
    }

    const updated = await repositories.users.setBanned(user.id, body.banned);
    logger.warn(
      { by: admin.telegramId.toString(), target: telegramId, banned: body.banned },
      'User ban status changed',
    );

    return { isBanned: updated.isBanned };
  });

  app.post('/api/admin/users/:telegramId/balance', async (request, reply) => {
    const admin = await requireAdmin(request);

    const { telegramId } = request.params as { telegramId: string };
    const body = request.body as { deltaETB?: unknown } | undefined;
    const deltaETB = typeof body?.deltaETB === 'string' ? body.deltaETB : null;

    if (!deltaETB || !/^-?\d+(\.\d{1,2})?$/.test(deltaETB)) {
      return reply.code(400).send({ error: 'deltaETB must be a decimal string, negative to debit' });
    }

    const user = await repositories.users.findByTelegramId(BigInt(telegramId));
    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const updated = await repositories.users.adjustBalance(user.id, Money.fromDecimal(deltaETB), {
      actorTelegramId: admin.telegramId,
      adjustmentId: randomUUID(),
    });

    // Manual balance changes are the highest-trust action in the panel.
    logger.warn(
      { by: admin.telegramId.toString(), target: telegramId, deltaETB },
      'Balance adjusted by an administrator',
    );

    await bot.telegram
      .sendMessage(
        Number(user.telegramId),
        `💰 An administrator adjusted your balance. New balance: *${updated.balance.format()}*`,
        { parse_mode: 'Markdown' },
      )
      .catch(() => undefined);

    return { balance: { amount: updated.balance.toDecimalString(), label: updated.balance.format() } };
  });

  // --- discounts --------------------------------------------------------

  app.get('/api/admin/discounts', async (request) => {
    await requireAdmin(request);

    const [discounts, products] = await Promise.all([
      repositories.discounts.listAll(),
      repositories.products.listActive(),
    ]);

    const nameById = new Map(products.map((product) => [product.id, product.name]));
    const now = new Date();

    return {
      discounts: discounts.map((discount) => ({
        id: discount.id,
        scope: discount.scope,
        productId: discount.productId,
        productName: discount.productId ? (nameById.get(discount.productId) ?? null) : null,
        type: discount.type,
        value: discount.value,
        label: discount.label,
        isActive: discount.isActive,
        // Switched on but outside its window reads as inactive to a customer,
        // so the panel shows that distinctly.
        isLive: isDiscountLive(discount, now),
        startsAt: discount.startsAt?.toISOString() ?? null,
        endsAt: discount.endsAt?.toISOString() ?? null,
        createdAt: discount.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/admin/discounts', async (request, reply) => {
    const admin = await requireAdmin(request);
    const body = request.body as Record<string, unknown> | undefined;

    const scope = body?.scope === 'PRODUCT' ? 'PRODUCT' : 'ALL';
    const type = body?.type === 'FIXED' ? 'FIXED' : 'PERCENT';
    const value = typeof body?.value === 'string' ? body.value.trim() : '';

    if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
      return reply.code(400).send({ error: 'value must be a positive number' });
    }

    if (type === 'PERCENT' && Number(value) > 100) {
      return reply.code(400).send({ error: 'a percentage cannot exceed 100' });
    }

    let productId: string | null = null;
    if (scope === 'PRODUCT') {
      const slugOrId = typeof body?.productId === 'string' ? body.productId : '';
      const product = await repositories.products.findBySlugOrId(slugOrId);
      if (!product) return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
      productId = product.id;
    }

    const parseDate = (raw: unknown): Date | null => {
      if (typeof raw !== 'string' || raw === '') return null;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const startsAt = parseDate(body?.startsAt);
    const endsAt = parseDate(body?.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) {
      return reply.code(400).send({ error: 'the end date must be after the start date' });
    }

    const discount = await repositories.discounts.create({
      scope,
      productId,
      type,
      value,
      label: typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null,
      startsAt,
      endsAt,
      createdByTelegramId: admin.telegramId,
    });

    // Prices change for every customer, so this is worth an audit line.
    logger.warn(
      { by: admin.telegramId.toString(), scope, type, value, productId },
      'Discount created',
    );

    return reply.code(201).send({ id: discount.id });
  });

  app.post('/api/admin/discounts/:id/active', async (request, reply) => {
    const admin = await requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { isActive?: unknown } | undefined;

    if (typeof body?.isActive !== 'boolean') {
      return reply.code(400).send({ error: 'isActive must be true or false' });
    }

    const existing = await repositories.discounts.findById(id);
    if (!existing) return reply.code(404).send({ error: 'DISCOUNT_NOT_FOUND' });

    const updated = await repositories.discounts.setActive(id, body.isActive);
    logger.warn(
      { by: admin.telegramId.toString(), id, isActive: body.isActive },
      'Discount switched',
    );

    return { isActive: updated.isActive };
  });

  app.delete('/api/admin/discounts/:id', async (request, reply) => {
    const admin = await requireAdmin(request);
    const { id } = request.params as { id: string };

    const removed = await repositories.discounts.remove(id);
    if (!removed) return reply.code(404).send({ error: 'DISCOUNT_NOT_FOUND' });

    logger.warn({ by: admin.telegramId.toString(), id }, 'Discount deleted');
    return { removed: id };
  });

  // --- administrators ---------------------------------------------------

  app.get('/api/admin/admins', async (request) => {
    await requireAdmin(request);

    const admins = await useCases.manageAdmins.list();
    return {
      admins: admins.map((entry) => ({
        telegramId: entry.admin.telegramId.toString(),
        firstName: entry.firstName,
        username: entry.username,
        note: entry.admin.note,
        addedBy: entry.admin.addedByTelegramId?.toString() ?? null,
        createdAt: entry.admin.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/admin/admins', async (request, reply) => {
    const admin = await requireAdmin(request);

    const body = request.body as { telegramId?: unknown; note?: unknown } | undefined;
    const raw = typeof body?.telegramId === 'string' ? body.telegramId.trim() : '';
    if (!/^\d{5,20}$/.test(raw)) {
      return reply.code(400).send({ error: 'telegramId must be a numeric Telegram user id' });
    }

    const granted = await useCases.manageAdmins.grant({
      telegramId: BigInt(raw),
      grantedBy: admin.telegramId,
      ...(typeof body?.note === 'string' ? { note: body.note } : {}),
    });

    return reply.code(201).send({ telegramId: granted.telegramId.toString() });
  });

  app.delete('/api/admin/admins/:telegramId', async (request, reply) => {
    const admin = await requireAdmin(request);
    const { telegramId } = request.params as { telegramId: string };

    if (!/^\d{5,20}$/.test(telegramId)) {
      return reply.code(400).send({ error: 'telegramId must be numeric' });
    }

    await useCases.manageAdmins.revoke({
      telegramId: BigInt(telegramId),
      revokedBy: admin.telegramId,
    });

    return { removed: telegramId };
  });
}
