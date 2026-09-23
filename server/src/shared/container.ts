import { Agent } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Telegraf } from 'telegraf';

import type {
  AdminRepository,
  ConfigRepository,
  DepositRepository,
  DiscountRepository,
  FeedbackRepository,
  OrderRepository,
  ProductRepository,
  UserRepository,
} from '../core/ports/repositories.js';
import type {
  AdminNotifier,
  CachePort,
  DepositNotifier,
  YeneShopGateway,
  OrderNotifier,
} from '../core/ports/services.js';
import { RedisCache } from '../infrastructure/cache/RedisCache.js';
import { createPrismaClient, type PrismaClient } from '../infrastructure/database/prisma.js';
import { PrismaAdminRepository } from '../infrastructure/database/repositories/PrismaAdminRepository.js';
import { PrismaConfigRepository } from '../infrastructure/database/repositories/PrismaConfigRepository.js';
import { PrismaDepositRepository } from '../infrastructure/database/repositories/PrismaDepositRepository.js';
import { PrismaDiscountRepository } from '../infrastructure/database/repositories/PrismaDiscountRepository.js';
import { PrismaFeedbackRepository } from '../infrastructure/database/repositories/PrismaFeedbackRepository.js';
import { PrismaOrderRepository } from '../infrastructure/database/repositories/PrismaOrderRepository.js';
import { PrismaProductRepository } from '../infrastructure/database/repositories/PrismaProductRepository.js';
import { PrismaUserRepository } from '../infrastructure/database/repositories/PrismaUserRepository.js';
import { YeneShopClient } from '../infrastructure/yeneshop/YeneShopClient.js';
import { LogoStorage } from '../infrastructure/storage/LogoStorage.js';
import { ReceiptStorage } from '../infrastructure/storage/ReceiptStorage.js';
import { ChannelMembershipService } from '../infrastructure/telegram/ChannelMembershipService.js';
import { BackupManager } from '../infrastructure/backup/BackupManager.js';
import { TelegramNotifier } from '../interfaces/bot/TelegramNotifier.js';
import { ApproveDepositUseCase, RejectDepositUseCase } from '../use-cases/deposit/ReviewDepositUseCase.js';
import { RequestDepositUseCase } from '../use-cases/deposit/RequestDepositUseCase.js';
import { PlaceOrderUseCase } from '../use-cases/order/PlaceOrderUseCase.js';
import { ReconcileYeneShopOrdersUseCase } from '../use-cases/order/ReconcileYeneShopOrdersUseCase.js';
import { ListProductsUseCase } from '../use-cases/product/ListProductsUseCase.js';
import { AnnounceNewArrivalUseCase } from '../use-cases/product/AnnounceNewArrivalUseCase.js';
import { PublishLowStockUseCase } from '../use-cases/product/PublishLowStockUseCase.js';
import { ReorderProductsUseCase } from '../use-cases/product/ReorderProductsUseCase.js';
import { SetProductPriceUseCase } from '../use-cases/product/SetProductPriceUseCase.js';
import { SetProductAvailabilityUseCase } from '../use-cases/product/SetProductAvailabilityUseCase.js';
import { SyncProductsUseCase } from '../use-cases/product/SyncProductsUseCase.js';
import { ManageAdminsUseCase } from '../use-cases/admin/ManageAdminsUseCase.js';
import { SubmitFeedbackUseCase } from '../use-cases/feedback/SubmitFeedbackUseCase.js';
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
    feedback: FeedbackRepository;
  };
  services: {
    yeneshop: YeneShopGateway;
    receipts: ReceiptStorage;
    logos: LogoStorage;
    notifier: AdminNotifier;
    depositNotifier: DepositNotifier;
    orderNotifier: OrderNotifier;
    cache: CachePort;
    channelMembership: ChannelMembershipService;
    backups: BackupManager;
  };
  useCases: {
    registerUser: RegisterUserUseCase;
    manageAdmins: ManageAdminsUseCase;
    listProducts: ListProductsUseCase;
    announceNewArrival: AnnounceNewArrivalUseCase;
    publishLowStock: PublishLowStockUseCase;
    reorderProducts: ReorderProductsUseCase;
    setProductPrice: SetProductPriceUseCase;
    setProductAvailability: SetProductAvailabilityUseCase;
    syncProducts: SyncProductsUseCase;
    placeOrder: PlaceOrderUseCase;
    reconcileYeneShopOrders: ReconcileYeneShopOrdersUseCase;
    requestDeposit: RequestDepositUseCase;
    approveDeposit: ApproveDepositUseCase;
    rejectDeposit: RejectDepositUseCase;
    submitFeedback: SubmitFeedbackUseCase;
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

  const orderRepository = new PrismaOrderRepository(prisma);
  const repositories = {
    users: new PrismaUserRepository(prisma),
    products: new PrismaProductRepository(prisma),
    orders: orderRepository,
    deposits: new PrismaDepositRepository(prisma),
    config: new PrismaConfigRepository(prisma),
    admins: new PrismaAdminRepository(prisma),
    discounts: new PrismaDiscountRepository(prisma),
    feedback: new PrismaFeedbackRepository(prisma),
  };

  const yeneshop = new YeneShopClient({
    baseUrl: config.YENESHOP_API_URL,
    apiKey: config.YENESHOP_API_KEY,
    logger,
  });

  // Deliberately one level above server/: deploys rsync --delete that
  // directory, which would take every stored receipt with it. Four segments up
  // lands on the repo root from both src/shared/ and dist/shared/.
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');
  const receiptsRoot = config.RECEIPTS_DIR || path.join(repoRoot, 'data/receipts');
  const logosRoot = path.join(repoRoot, 'assets/logos');
  const backupRoot = config.BACKUPS_DIR || path.join(repoRoot, 'data/backups');
  const receipts = new ReceiptStorage(receiptsRoot);
  // The directory the repo ships and nginx serves; uploads land beside the
  // built logos rather than in a second place the client would have to know about.
  const logos = new LogoStorage(logosRoot);

  const notifier = new TelegramNotifier(
    bot,
    // The table is authoritative; the environment is the fallback for the
    // window before it has been seeded.
    async () => {
      const admins = await repositories.admins.list();
      return admins.length > 0 ? admins.map((admin) => admin.telegramId) : config.ADMIN_TELEGRAM_IDS;
    },
    () => repositories.users.listBroadcastRecipients(),
    config.ANNOUNCEMENT_CHANNEL,
    logger,
  );
  const channelMembership = new ChannelMembershipService(
    bot.telegram,
    config.ANNOUNCEMENT_CHANNEL,
  );
  const backups = new BackupManager({
    databaseUrl: config.DATABASE_URL,
    backupRoot,
    receiptsRoot,
    logosRoot,
    prisma,
    config: repositories.config,
    cache,
    receipts,
    telegram: bot.telegram,
    notifier,
    logger,
  });

  const listProducts = new ListProductsUseCase({
    products: repositories.products,
    discounts: repositories.discounts,
    orders: repositories.orders,
  });
  const reorderProducts = new ReorderProductsUseCase({ products: repositories.products, cache });
  const placeOrder = new PlaceOrderUseCase({
    users: repositories.users,
    products: repositories.products,
    discounts: repositories.discounts,
    orders: repositories.orders,
    yeneshop,
    notifier,
    logger,
  });
  const useCases = {
    registerUser: new RegisterUserUseCase({ users: repositories.users }),
    manageAdmins: new ManageAdminsUseCase({
      admins: repositories.admins,
      users: repositories.users,
      logger,
    }),
    listProducts,
    reorderProducts,
    announceNewArrival: new AnnounceNewArrivalUseCase({
      catalogue: listProducts,
      reorder: reorderProducts,
      notifier,
      channel: notifier,
      productImages: logos,
      logger,
    }),
    publishLowStock: new PublishLowStockUseCase({
      products: repositories.products,
      productImages: logos,
      channel: notifier,
      logger,
    }),
    setProductAvailability: new SetProductAvailabilityUseCase({
      products: repositories.products,
      cache,
    }),
    setProductPrice: new SetProductPriceUseCase({
      products: repositories.products,
      cache,
    }),
    syncProducts: new SyncProductsUseCase({
      yeneshop,
      products: repositories.products,
      cache,
      logger,
    }),
    placeOrder,
    reconcileYeneShopOrders: new ReconcileYeneShopOrdersUseCase({
      orders: repositories.orders,
      products: repositories.products,
      users: repositories.users,
      yeneshop,
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
    submitFeedback: new SubmitFeedbackUseCase({ feedback: repositories.feedback }),
  };

  return {
    config,
    logger,
    bot,
    prisma,
    cache,
    repositories,
    services: {
      yeneshop,
      receipts,
      logos,
      notifier,
      depositNotifier: notifier,
      orderNotifier: notifier,
      cache,
      channelMembership,
      backups,
    },
    useCases,
    async shutdown() {
      backups.stop();
      await Promise.allSettled([prisma.$disconnect(), cache.disconnect()]);
    },
  };
}
