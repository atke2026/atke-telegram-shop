import { Agent } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Telegraf } from 'telegraf';

import type {
  AdminRepository,
  ConfigRepository,
  DepositRepository,
  DiscountRepository,
  OrderRepository,
  ProductRepository,
  UserRepository,
} from '../core/ports/repositories.js';
import type { AdminNotifier, CachePort, DepositNotifier, HubxGateway } from '../core/ports/services.js';
import { RedisCache } from '../infrastructure/cache/RedisCache.js';
import { createPrismaClient, type PrismaClient } from '../infrastructure/database/prisma.js';
import { PrismaAdminRepository } from '../infrastructure/database/repositories/PrismaAdminRepository.js';
import { PrismaConfigRepository } from '../infrastructure/database/repositories/PrismaConfigRepository.js';
import { PrismaDepositRepository } from '../infrastructure/database/repositories/PrismaDepositRepository.js';
import { PrismaDiscountRepository } from '../infrastructure/database/repositories/PrismaDiscountRepository.js';
import { PrismaOrderRepository } from '../infrastructure/database/repositories/PrismaOrderRepository.js';
import { PrismaProductRepository } from '../infrastructure/database/repositories/PrismaProductRepository.js';
import { PrismaUserRepository } from '../infrastructure/database/repositories/PrismaUserRepository.js';
import { HubxClient } from '../infrastructure/hubx/HubxClient.js';
import { ReceiptStorage } from '../infrastructure/storage/ReceiptStorage.js';
import { TelegramNotifier } from '../interfaces/bot/TelegramNotifier.js';
import { ApproveDepositUseCase, RejectDepositUseCase } from '../use-cases/deposit/ReviewDepositUseCase.js';
import { RequestDepositUseCase } from '../use-cases/deposit/RequestDepositUseCase.js';
import { PlaceOrderUseCase } from '../use-cases/order/PlaceOrderUseCase.js';
import { ListProductsUseCase } from '../use-cases/product/ListProductsUseCase.js';
import { SetProductPriceUseCase } from '../use-cases/product/SetProductPriceUseCase.js';
import { SyncProductsUseCase } from '../use-cases/product/SyncProductsUseCase.js';
import { ManageAdminsUseCase } from '../use-cases/admin/ManageAdminsUseCase.js';
import { RegisterUserUseCase } from '../use-cases/user/RegisterUserUseCase.js';
import type { Config } from './config.js';
import { createLogger, type Logger } from './logger.js';

export interface Container {
  config: Config;
  logger: Logger;
  bot: Telegraf;
  prisma: PrismaClient;
  cache: RedisCache;
  repositories: {
    users: UserRepository;
    products: ProductRepository;
    orders: OrderRepository;
    deposits: DepositRepository;
    config: ConfigRepository;
    admins: AdminRepository;
    discounts: DiscountRepository;
  };
  services: {
    hubx: HubxGateway;
    receipts: ReceiptStorage;
    notifier: AdminNotifier;
    depositNotifier: DepositNotifier;
    cache: CachePort;
  };
  useCases: {
    registerUser: RegisterUserUseCase;
    manageAdmins: ManageAdminsUseCase;
    listProducts: ListProductsUseCase;
    setProductPrice: SetProductPriceUseCase;
    syncProducts: SyncProductsUseCase;
    placeOrder: PlaceOrderUseCase;
    requestDeposit: RequestDepositUseCase;
    approveDeposit: ApproveDepositUseCase;
    rejectDeposit: RejectDepositUseCase;
  };
  shutdown(): Promise<void>;
}

export function buildContainer(config: Config): Container {
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

  const prisma = createPrismaClient(config.DATABASE_URL);
  const cache = RedisCache.connect(config.REDIS_URL, logger);
  // api.telegram.org publishes an AAAA record, but hosts without an IPv6 route
  // stall on it instead of falling back cleanly. Pinning the agent to IPv4
  // avoids that; keepAlive also spares a TLS handshake per API call.
  const bot = new Telegraf(config.BOT_TOKEN, {
    telegram: { agent: new Agent({ family: 4, keepAlive: true }) },
  });

  const repositories = {
    users: new PrismaUserRepository(prisma),
    products: new PrismaProductRepository(prisma),
    orders: new PrismaOrderRepository(prisma),
    deposits: new PrismaDepositRepository(prisma),
    config: new PrismaConfigRepository(prisma),
    admins: new PrismaAdminRepository(prisma),
    discounts: new PrismaDiscountRepository(prisma),
  };

  const hubx = new HubxClient({ baseUrl: config.HUBX_API_URL, apiKey: config.HUBX_API_KEY, logger });

  // Deliberately one level above server/: deploys rsync --delete that
  // directory, which would take every stored receipt with it. Four segments up
  // lands on the repo root from both src/shared/ and dist/shared/.
  const receipts = new ReceiptStorage(
    config.RECEIPTS_DIR ||
      path.resolve(fileURLToPath(import.meta.url), '../../../..', 'data/receipts'),
  );
  const notifier = new TelegramNotifier(
    bot,
    // The table is authoritative; the environment is the fallback for the
    // window before it has been seeded.
    async () => {
      const admins = await repositories.admins.list();
      return admins.length > 0 ? admins.map((admin) => admin.telegramId) : config.ADMIN_TELEGRAM_IDS;
    },
    logger,
  );

  const useCases = {
    registerUser: new RegisterUserUseCase({ users: repositories.users }),
    manageAdmins: new ManageAdminsUseCase({
      admins: repositories.admins,
      users: repositories.users,
      logger,
    }),
    listProducts: new ListProductsUseCase({
      products: repositories.products,
      discounts: repositories.discounts,
    }),
    setProductPrice: new SetProductPriceUseCase({
      products: repositories.products,
      config: repositories.config,
      cache,
      defaultRate: String(config.DEFAULT_USDT_ETB_RATE),
    }),
    syncProducts: new SyncProductsUseCase({
      hubx,
      products: repositories.products,
      config: repositories.config,
      cache,
      defaultRate: String(config.DEFAULT_USDT_ETB_RATE),
      logger,
    }),
    placeOrder: new PlaceOrderUseCase({
      users: repositories.users,
      products: repositories.products,
      discounts: repositories.discounts,
      orders: repositories.orders,
      hubx,
      notifier,
      logger,
    }),
    requestDeposit: new RequestDepositUseCase({
      users: repositories.users,
      deposits: repositories.deposits,
      products: repositories.products,
    }),
    approveDeposit: new ApproveDepositUseCase({ deposits: repositories.deposits, logger }),
    rejectDeposit: new RejectDepositUseCase({ deposits: repositories.deposits, logger }),
  };

  return {
    config,
    logger,
    bot,
    prisma,
    cache,
    repositories,
    services: { hubx, receipts, notifier, depositNotifier: notifier, cache },
    useCases,
    async shutdown() {
      await Promise.allSettled([prisma.$disconnect(), cache.disconnect()]);
    },
  };
}
