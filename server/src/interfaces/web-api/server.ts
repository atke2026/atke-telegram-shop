import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import type { User } from '../../core/entities/User.js';
import { DomainError } from '../../core/errors/DomainError.js';
import { priceWithDiscounts } from '../../core/entities/Discount.js';
import { DEFAULT_MAINTENANCE_MESSAGE, getMaintenance, maintenanceImageUrl } from '../../core/maintenance.js';
import { PAYMENT_METHODS } from '../../core/paymentMethods.js';
import { productDetails } from '../../core/entities/Product.js';
import { isStoredReceipt, UnsupportedImageError } from '../../infrastructure/storage/ReceiptStorage.js';
import { toUserMessage } from '../../shared/errorMessages.js';
import { registerAdminRoutes } from './adminRoutes.js';
import { InitDataError, verifyInitData } from '../../infrastructure/telegram/verifyInitData.js';
import {
  BackupBusyError,
  InvalidBackupError,
} from '../../infrastructure/backup/BackupManager.js';
import type { Container } from '../../shared/container.js';
import {
  toDepositDto,
  toOrderDto,
  toProductDto,
  toUserDto,
  type MoneyDto,
} from './serializers.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth hook; present on every route except /api/health. */
    currentUser?: User;
  }
}

/** Base64 of a 5MB image, plus overhead. Fastify rejects anything larger outright. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function statusForDomainError(error: DomainError): number {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
    case 'INVALID_AMOUNT':
    case 'OUT_OF_STOCK':
    case 'PRODUCT_IMAGE_NOT_FOUND':
    case 'NO_FINITE_STOCK':
    case 'NOT_A_YENESHOP_PRODUCT':
    // Refusing to remove the last admin is a state conflict, not bad input.
    case 'LAST_ADMIN':
      return 409;
    case 'PRODUCT_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'DEPOSIT_NOT_FOUND':
    case 'ORDER_NOT_FOUND':
      return 404;
    // Already delivered: the state moved on, which is not bad input.
    case 'ORDER_NOT_AWAITING_DELIVERY':
      return 409;
    case 'USER_BANNED':
    case 'NOT_AN_ADMIN':
    case 'NOT_A_RESELLER':
    case 'RESELLER_SUSPENDED':
      return 403;
    case 'INVALID_RESELLER_API_KEY':
      return 401;
    case 'RESELLER_PRODUCT_UNAVAILABLE':
      return 404;
    case 'INVALID_RESELLER_PRICE':
    case 'RESELLER_EXTERNAL_ID_CONFLICT':
    case 'RESELLER_EXTERNAL_ORDER_EXISTS':
      return 409;
    case 'INVALID_RATING':
    case 'INVALID_RESELLER_EXTERNAL_ID':
      return 400;
    case 'SYSTEM_OFFLINE':
    case 'INVALID_API_KEY':
    case 'CHANNEL_PUBLISH_FAILED':
      return 503;
    default:
      return 400;
  }
}

export function createWebApi(container: Container): FastifyInstance {
  const { bot, config, logger, repositories, useCases } = container;
  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

  // Backup imports are streamed to a protected temporary file by the route;
  // returning the payload stream here avoids holding a potentially large
  // archive in Node's heap.
  app.addContentTypeParser(
    'application/vnd.suq.backup',
    (_request, payload, done) => done(null, payload),
  );

  void app.register(cors, {
    origin: config.WEB_APP_ORIGINS.length > 0 ? config.WEB_APP_ORIGINS : true,
    credentials: true,
  });

  // Serve the product logos from the repo root, so the web app and the bot
  // read the same files instead of keeping divergent copies.
  void app.register(fastifyStatic, {
    root: path.resolve(fileURLToPath(import.meta.url), '../../../../..', 'assets/logos'),
    prefix: '/logos/',
    decorateReply: false,
    cacheControl: true,
    maxAge: '7d',
  });

  /**
   * Authentication. The client sends the raw Telegram initData string; we
   * verify its HMAC against the bot token on every request. There is no
   * session or cookie — initData is short-lived and re-verified each time,
   * so a leaked string expires on its own.
   */
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Health, logos and the maintenance notice are public; the notice has to
    // load even for someone the maintenance gate is about to turn away.
    if (
      request.url.startsWith('/api/health') ||
      request.url.startsWith('/logos/') ||
      request.url.startsWith('/api/maintenance')
    ) {
      return;
    }

    // The restore request that raised this flag is already inside its handler.
    // Everything arriving afterwards waits outside the database while its
    // schema and upload directories are replaced.
    if (container.services.backups.isRestoring) {
      return reply.code(503).send({
        error: 'RESTORING_BACKUP',
        message: 'A full backup is being restored. Please try again shortly.',
      });
    }

    const header = request.headers.authorization ?? '';
    const initData = header.startsWith('tma ')
      ? header.slice(4)
      : ((request.headers['x-telegram-init-data'] as string | undefined) ?? '');

    try {
      const verified = verifyInitData(initData, config.BOT_TOKEN, {
        maxAgeSeconds: config.INIT_DATA_MAX_AGE_SECONDS,
      });

      // Frictionless onboarding: a first-time web visitor is registered here
      // rather than being told to go and message the bot.
      request.currentUser = await useCases.registerUser.execute({
        telegramId: verified.user.id,
        username: verified.user.username,
        firstName: verified.user.firstName,
      });
    } catch (error) {
      if (error instanceof InitDataError) {
        logger.warn({ reason: error.reason }, 'Rejected web app request');
        return reply.code(401).send({ error: 'unauthorized', reason: error.reason });
      }
      throw error;
    }

    // Global subscription gate. Authentication above gives us the Telegram id;
    // the same service and same announcement channel protect the bot as well.
    const gatedUser = request.currentUser;
    if (gatedUser && config.CHANNEL_MEMBERSHIP_REQUIRED) {
      let joined: boolean;
      try {
        joined = await container.services.channelMembership.hasJoined(gatedUser.telegramId);
      } catch (error) {
        logger.error(
          {
            err: error,
            telegramId: gatedUser.telegramId.toString(),
            channel: container.services.channelMembership.channel,
          },
          'Could not verify web app channel membership',
        );
        return reply.code(503).send({
          error: 'CHANNEL_MEMBERSHIP_UNAVAILABLE',
          message: 'Could not verify channel membership right now. Please try again.',
        });
      }

      if (!joined) {
        return reply.code(403).send({
          error: 'JOIN_CHANNEL_REQUIRED',
          message: `Join ${container.services.channelMembership.channel} to continue.`,
          channel: container.services.channelMembership.channel,
          joinUrl: container.services.channelMembership.joinUrl,
        });
      }
    }

    // Maintenance gate: while on, non-admins cannot act. /api/me stays open so
    // the app can still learn it is talking to an admin and let them through.
    if (gatedUser && !request.url.startsWith('/api/me')) {
      const state = await getMaintenance(repositories.config);
      if (state.enabled && !(await useCases.manageAdmins.isAdmin(gatedUser.telegramId))) {
        return reply
          .code(503)
          .send({ error: 'MAINTENANCE', message: state.message ?? DEFAULT_MAINTENANCE_MESSAGE });
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof InvalidBackupError || error instanceof RangeError) {
      return reply.code(400).send({ error: 'INVALID_BACKUP', message: error.message });
    }
    if (error instanceof BackupBusyError) {
      return reply.code(409).send({ error: 'BACKUP_BUSY', message: error.message });
    }

    if (error instanceof DomainError) {
      // The client shows `message` directly, so it must be customer-facing
      // copy. Domain messages are written for operators — SystemOfflineError
      // names the reseller balance, InvalidApiKeyError names the API key — and
      // must never be forwarded verbatim. The real reason goes to the log.
      logger.info({ code: error.code, reason: error.message, url: request.url }, 'Domain error');

      return reply
        .code(statusForDomainError(error))
        .send({ error: error.code, message: toUserMessage(error) });
    }

    logger.error({ err: error, url: request.url }, 'Web API error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  const requireUser = (request: FastifyRequest): User => {
    if (!request.currentUser) throw new Error('auth hook did not populate currentUser');
    return request.currentUser;
  };

  app.get('/api/health', async () => ({ ok: true }));

  // Public: the web app polls this on load to decide whether to show the
  // maintenance screen. The image is streamed separately so the payload here
  // stays a small JSON the app can read even while it is being turned away.
  app.get('/api/maintenance', async () => {
    if (container.services.backups.isRestoring) {
      return {
        enabled: true,
        message: 'A full backup is being restored. The shop will return shortly.',
        imageUrl: null,
      };
    }
    const state = await getMaintenance(repositories.config);
    return {
      enabled: state.enabled,
      message: state.message ?? (state.enabled ? DEFAULT_MAINTENANCE_MESSAGE : null),
      imageUrl: maintenanceImageUrl(state),
    };
  });

  app.get('/api/maintenance/image', async (_request, reply) => {
    if (container.services.backups.isRestoring) {
      return reply.code(503).send({ error: 'RESTORING_BACKUP' });
    }
    const state = await getMaintenance(repositories.config);
    if (!state.imageFileId) return reply.code(404).send({ error: 'NO_IMAGE' });

    // A panel upload is stored on disk; a bot upload is a Telegram file_id.
    if (isStoredReceipt(state.imageFileId)) {
      const stored = await container.services.receipts.read(state.imageFileId);
      if (!stored) return reply.code(404).send({ error: 'IMAGE_NOT_FOUND' });

      return reply
        .header('Content-Type', stored.contentType)
        .header('Cache-Control', 'public, max-age=300')
        .send(stored.buffer);
    }

    try {
      // Resolve the Telegram file_id with the bot token, exactly as receipts do.
      const link = await bot.telegram.getFileLink(state.imageFileId);
      const response = await fetch(link.toString());
      if (!response.ok) return reply.code(502).send({ error: 'IMAGE_FETCH_FAILED' });

      const buffer = Buffer.from(await response.arrayBuffer());
      return reply
        .header('Content-Type', response.headers.get('content-type') ?? 'image/jpeg')
        .header('Cache-Control', 'public, max-age=300')
        .send(buffer);
    } catch (error) {
      logger.error({ err: error }, 'Could not load maintenance image');
      return reply.code(502).send({ error: 'IMAGE_FETCH_FAILED' });
    }
  });

  app.get('/api/me', async (request) => {
    const user = requireUser(request);
    // Drives the Panel tab's visibility only; every admin route re-checks.
    const isAdmin = await useCases.manageAdmins.isAdmin(user.telegramId);

    return {
      user: {
        ...toUserDto(user),
        isAdmin,
      },
    };
  });

  app.get('/api/products', async () => {
    const entries = await useCases.listProducts.priced();
    return { products: entries.map((entry) => toProductDto(entry.product, entry.priced)) };
  });

  app.get('/api/products/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const product = await repositories.products.findBySlugOrId(slug);

    if (!product || product.source !== 'YENESHOP' || !product.isActive) {
      return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });
    }

    const priced = priceWithDiscounts(
      product.sellingPrice,
      product.id,
      await repositories.discounts.listActive(),
    );

    return { product: toProductDto(product, priced) };
  });

  app.get('/api/orders', async (request) => {
    const orders = await repositories.orders.listByUser(requireUser(request).id, 50);

    // Redemption steps come from the product, not a copy frozen on the order,
    // so correcting a set of instructions fixes it for past buyers too.
    const products = await repositories.products.findByIds([
      ...new Set(orders.map((order) => order.productId)),
    ]);
    const detailsById = new Map(products.map((product) => [product.id, productDetails(product)]));

    return {
      orders: orders.map((order) => toOrderDto(order, detailsById.get(order.productId) ?? null)),
    };
  });

  app.post('/api/orders', async (request, reply) => {
    const body = request.body as { productId?: unknown; customerInput?: unknown } | undefined;
    const productId = typeof body?.productId === 'string' ? body.productId : null;
    if (!productId) return reply.code(400).send({ error: 'productId is required' });

    const user = requireUser(request);
    const result = await useCases.placeOrder.execute({
      userId: user.id,
      productId,
      // Validated against the product in the use case, not here — the rule
      // belongs with the product that set it.
      customerInput: typeof body?.customerInput === 'string' ? body.customerInput : null,
    });

    return {
      order: {
        id: result.orderId,
        productName: result.productName,
        pricePaid: { amount: result.pricePaid.toDecimalString(), label: result.pricePaid.format() },
        listPrice: { amount: result.listPrice.toDecimalString(), label: result.listPrice.format() },
        discountAmount: {
          amount: result.discountAmount.toDecimalString(),
          label: result.discountAmount.format(),
        },
        deliveredItems: result.deliveredItems,
        // Paid for, but prepared by hand: the app shows "on its way" rather
        // than an empty delivery, and the order stays pending until it lands.
        awaitingDelivery: result.awaitingDelivery,
        instructions: result.instructions,
      },
      balance: {
        amount: result.newBalance.toDecimalString(),
        label: result.newBalance.format(),
      } satisfies MoneyDto,
    };
  });

  /**
   * Drives the satisfaction prompt, which the app decides on once per load.
   *
   * Both gates are answered here rather than on the device: the server knows
   * whether they have already rated, so reinstalling or opening the Mini App
   * on another phone cannot restart the asking, and it knows whether they have
   * ever bought anything, which is what makes the question worth asking at all.
   */
  app.get('/api/feedback', async (request) => {
    const user = requireUser(request);

    const [submitted, hasPurchased] = await Promise.all([
      useCases.submitFeedback.hasSubmitted(user.id),
      repositories.orders.hasAnyOrder(user.id),
    ]);

    return { submitted, hasPurchased };
  });

  app.post('/api/feedback', async (request, reply) => {
    const body = request.body as { rating?: unknown } | undefined;

    const feedback = await useCases.submitFeedback.execute({
      userId: requireUser(request).id,
      // Passed through unvalidated on purpose: the use case owns the rule, and
      // a string "5" from a hand-rolled client should be rejected, not coerced.
      rating: body?.rating,
    });

    return reply.code(201).send({ feedback: { rating: feedback.rating } });
  });

  app.get('/api/deposits', async (request) => {
    const user = requireUser(request);
    const deposits = await repositories.deposits.listByStatus('PENDING', 50);
    const minimum = await useCases.requestDeposit.minimumDeposit();

    return {
      deposits: deposits.filter((deposit) => deposit.userId === user.id).map(toDepositDto),
      minimum: { amount: minimum.toDecimalString(), label: minimum.format() } satisfies MoneyDto,
      paymentMethods: PAYMENT_METHODS.map((method) => ({
        id: method.id,
        name: method.name,
        accountNumber: method.accountNumber,
        accountName: method.accountName,
        logoUrl: `/logos/${method.logoSlug}.webp`,
      })),
    };
  });

  app.post('/api/deposits', async (request, reply) => {
    const body = request.body as { amountETB?: unknown; receiptBase64?: unknown } | undefined;
    const amountETB = typeof body?.amountETB === 'string' ? body.amountETB : null;
    const receiptBase64 = typeof body?.receiptBase64 === 'string' ? body.receiptBase64 : null;

    if (!amountETB || !receiptBase64) {
      return reply.code(400).send({ error: 'amountETB and receiptBase64 are required' });
    }

    // Accepts a bare base64 payload or a data: URL from a file input.
    const base64 = receiptBase64.replace(/^data:image\/[a-z+]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) return reply.code(400).send({ error: 'receipt image is empty' });

    const user = requireUser(request);

    // Stored before the deposit row exists: an admin has to be able to see the
    // receipt to verify it, and a deposit recorded without one is unreviewable.
    let receiptReference: string;
    try {
      receiptReference = await container.services.receipts.save(buffer);
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        return reply.code(400).send({ error: 'receipt must be a JPEG, PNG, WebP or GIF image' });
      }
      throw error;
    }

    const deposit = await useCases.requestDeposit.execute({
      userId: user.id,
      amountETB,
      screenshotUrl: receiptReference,
    });

    await container.services.depositNotifier.notifyNewDeposit({
      depositId: deposit.id,
      amountLabel: deposit.amount.format(),
      user: { telegramId: user.telegramId, firstName: user.firstName, username: user.username },
      photo: { buffer },
    });

    return reply.code(201).send({ deposit: toDepositDto(deposit) });
  });

  registerAdminRoutes(app, container);

  return app;
}
