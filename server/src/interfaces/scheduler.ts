import cron from 'node-cron';

import type { Container } from '../shared/container.js';

/** Background catalogue refresh. Failures are logged, never thrown. */
export function startScheduler(container: Container): { stop: () => void } {
  const { config, logger, useCases, services } = container;

  const runSync = async (trigger: string) => {
    try {
      const result = await useCases.syncProducts.execute();
      logger.info({ trigger, ...result }, 'Scheduled sync finished');
    } catch (error) {
      logger.error({ err: error, trigger }, 'Scheduled sync failed');
      await services.notifier
        .alert(`⚠️ Product sync failed: ${(error as Error).message}`)
        .catch(() => undefined);
    }
  };

  // Prime the catalogue at boot so the bot is never serving an empty store.
  void runSync('startup');

  const task = cron.schedule(config.PRODUCT_SYNC_CRON, () => void runSync('cron'));
  logger.info({ schedule: config.PRODUCT_SYNC_CRON }, 'Product sync scheduled');

  return { stop: () => task.stop() };
}
