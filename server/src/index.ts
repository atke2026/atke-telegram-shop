import { createBot } from './interfaces/bot/bot.js';
import { createWebApi } from './interfaces/web-api/server.js';
import { startScheduler } from './interfaces/scheduler.js';
import { loadConfig } from './shared/config.js';
import { buildContainer } from './shared/container.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildContainer(config);
  const { logger } = container;

  // Must run before the bot or API accept anything, or a fresh deployment
  // would have no administrators at all.
  await container.useCases.manageAdmins.seedIfEmpty(config.ADMIN_TELEGRAM_IDS);
  await container.services.backups.start();

  const bot = createBot(container);
  const scheduler = startScheduler(container);
  container.services.backups.setRestoreHooks({
    beforeRestore: scheduler.pause,
    afterRestore: scheduler.resume,
  });

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Open Suq.et' },
  ]);
  await bot.telegram.setChatMenuButton({
    menuButton: {
      type: 'web_app',
      text: 'Open Suq.et',
      web_app: { url: config.WEB_APP_URL },
    },
  });

  const api = createWebApi(container);
  await api.listen({ port: config.WEB_API_PORT, host: config.WEB_API_HOST });
  logger.info({ port: config.WEB_API_PORT }, '🌐 Web API listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    scheduler.stop();
    bot.stop(signal);
    await api.close();
    await container.shutdown();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await bot.launch(() => logger.info('🤖 Bot is running'));
}

main().catch((error) => {
  console.error('Fatal startup error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
