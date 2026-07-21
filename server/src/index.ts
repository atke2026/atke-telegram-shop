import { createBot } from './interfaces/bot/bot.js';
import { createWebApi } from './interfaces/web-api/server.js';
import { startScheduler } from './interfaces/scheduler.js';
import { loadConfig } from './shared/config.js';
import { buildContainer } from './shared/container.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildContainer(config);
  const { logger } = container;

  const bot = createBot(container);
  const scheduler = startScheduler(container);

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'products', description: 'Browse products' },
    { command: 'balance', description: 'Check your wallet balance' },
    { command: 'deposit', description: 'Top up your wallet' },
    { command: 'orders', description: 'View your recent orders' },
    { command: 'help', description: 'How this bot works' },
  ]);

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
