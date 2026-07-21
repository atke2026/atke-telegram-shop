import type { FastifyInstance, FastifyRequest } from 'fastify';

import { Money } from '../../core/entities/Money.js';
import type { User } from '../../core/entities/User.js';
import { NotAnAdminError } from '../../use-cases/admin/ManageAdminsUseCase.js';
import type { Container } from '../../shared/container.js';
import { toDepositDto, toProductDto } from './serializers.js';

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

  // --- overview ---------------------------------------------------------

  app.get('/api/admin/summary', async (request) => {
    await requireAdmin(request);

    const [products, pendingDeposits] = await Promise.all([
      repositories.products.listActive(),
      repositories.deposits.listByStatus('PENDING', 200),
    ]);

    let resellerBalance: string | null = null;
    try {
      resellerBalance = await services.hubx.getResellerBalanceUSDT();
    } catch {
      // The panel must still render when HubX is unreachable.
    }

    const pendingTotal = pendingDeposits.reduce(
      (total, deposit) => total.add(deposit.amount),
      Money.ZERO,
    );

    return {
      products: {
        active: products.length,
        outOfStock: products.filter((product) => product.stock === 0).length,
      },
      deposits: {
        pending: pendingDeposits.length,
        pendingTotal: { amount: pendingTotal.toDecimalString(), label: pendingTotal.format() },
      },
      hubx: { balanceUSDT: resellerBalance },
    };
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

    // Web uploads are handed straight to Telegram and never stored here.
    if (deposit.screenshotUrl === 'webapp-upload') {
      return reply.code(404).send({ error: 'RECEIPT_NOT_STORED' });
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

    const products = await repositories.products.listActive();
    return {
      products: products.map((product) => ({
        ...toProductDto(product),
        costPriceUSDT: product.costPriceUSDT,
        fixedPrice: product.priceOverride !== null,
      })),
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

  app.post('/api/admin/sync', async (request) => {
    await requireAdmin(request);
    return useCases.syncProducts.execute();
  });

  // --- users ------------------------------------------------------------

  app.get('/api/admin/users/:telegramId', async (request, reply) => {
    await requireAdmin(request);

    const { telegramId } = request.params as { telegramId: string };
    let user;
    try {
      user = await repositories.users.findByTelegramId(BigInt(telegramId));
    } catch {
      return reply.code(400).send({ error: 'telegramId must be numeric' });
    }

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const orders = await repositories.orders.listByUser(user.id, 20);
    return {
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        firstName: user.firstName,
        username: user.username,
        isBanned: user.isBanned,
        balance: { amount: user.balance.toDecimalString(), label: user.balance.format() },
      },
      orderCount: orders.length,
    };
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

    const updated = await repositories.users.adjustBalance(user.id, Money.fromDecimal(deltaETB));

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
