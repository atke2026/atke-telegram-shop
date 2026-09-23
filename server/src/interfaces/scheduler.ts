import cron from 'node-cron';

import type { Container } from '../shared/container.js';

/** Background catalogue refresh. Failures are logged, never thrown. */
export function startScheduler(container: Container): {
  stop: () => void;
  pause: () => Promise<void>;
  resume: () => void;
} {
  const { config, logger, useCases, services } = container;
  let paused = false;
  let inFlight: Promise<void> | null = null;

  const runSync = async (trigger: string) => {
    if (paused || services.backups.isRestoring) return;
    const operation = (async () => {
      try {
        const result = await useCases.syncProducts.execute();
        logger.info({ trigger, ...result }, 'Scheduled sync finished');
        const orders = await useCases.reconcileYeneShopOrders.execute();
        if (orders.checked > 0) {
          logger.info({ trigger, ...orders }, 'Pending YeneShop orders reconciled');
        }
      } catch (error) {
        logger.error({ err: error, trigger }, 'Scheduled sync failed');
        await services.notifier
          .alert(`⚠️ Product sync failed: ${(error as Error).message}`)
          .catch(() => undefined);
      }
    })();
    inFlight = operation;
    try {
      await operation;
    } finally {
      if (inFlight === operation) inFlight = null;
    }
  };

  // Prime the catalogue at boot so the bot is never serving an empty store.
  void runSync('startup');

  const task = cron.schedule(config.PRODUCT_SYNC_CRON, () => void runSync('cron'));
  logger.info({ schedule: config.PRODUCT_SYNC_CRON }, 'Product sync scheduled');

  return {
    stop: () => task.stop(),
    pause: async () => {
      paused = true;
      task.stop();
      await inFlight;
    },
    resume: () => {
      paused = false;
      task.start();
    },
  };
}
