import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import type { User } from '../../core/entities/User.js';
import { DomainError } from '../../core/errors/DomainError.js';
import { priceWithDiscounts } from '../../core/entities/Discount.js';
import { PAYMENT_METHODS } from '../../core/paymentMethods.js';
import { UnsupportedImageError } from '../../infrastructure/storage/ReceiptStorage.js';
import { toUserMessage } from '../../shared/errorMessages.js';
import { registerAdminRoutes } from './adminRoutes.js';
import { InitDataError, verifyInitData } from '../../infrastructure/telegram/verifyInitData.js';
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
    // Refusing to remove the last admin is a state conflict, not bad input.
    case 'LAST_ADMIN':
      return 409;
    case 'PRODUCT_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'DEPOSIT_NOT_FOUND':
      return 404;
    case 'USER_BANNED':
    case 'NOT_AN_ADMIN':
      return 403;
    case 'SYSTEM_OFFLINE':
    case 'INVALID_API_KEY':
      return 503;
    default:
      return 400;
  }
}

export function createWebApi(container: Container): FastifyInstance {
  const { config, logger, repositories, useCases } = container;
  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });

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
    // Health and logos are public; everything else needs valid initData.
    if (request.url.startsWith('/api/health') || request.url.startsWith('/logos/')) return;

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
  });

  app.setErrorHandler((error, request, reply) => {
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

  app.get('/api/me', async (request) => {
    const user = requireUser(request);
    // Drives the Panel tab's visibility only; every admin route re-checks.
    const isAdmin = await useCases.manageAdmins.isAdmin(user.telegramId);

    return { user: { ...toUserDto(user), isAdmin } };
  });

  app.get('/api/products', async () => {
    const entries = await useCases.listProducts.priced();
    return { products: entries.map((entry) => toProductDto(entry.product, entry.priced)) };
  });

  app.get('/api/products/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const product = await repositories.products.findBySlugOrId(slug);

    if (!product || !product.isActive) return reply.code(404).send({ error: 'PRODUCT_NOT_FOUND' });

    const priced = priceWithDiscounts(
      product.sellingPrice,
      product.id,
      await repositories.discounts.listActive(),
    );

    return { product: toProductDto(product, priced) };
  });

  app.get('/api/orders', async (request) => {
    const orders = await repositories.orders.listByUser(requireUser(request).id, 50);
    return { orders: orders.map(toOrderDto) };
  });

  app.post('/api/orders', async (request, reply) => {
    const body = request.body as { productId?: unknown } | undefined;
    const productId = typeof body?.productId === 'string' ? body.productId : null;
    if (!productId) return reply.code(400).send({ error: 'productId is required' });

    const user = requireUser(request);
    const result = await useCases.placeOrder.execute({ userId: user.id, productId });

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
      },
      balance: {
        amount: result.newBalance.toDecimalString(),
        label: result.newBalance.format(),
      } satisfies MoneyDto,
    };
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
