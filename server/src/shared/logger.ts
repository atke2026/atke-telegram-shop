import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
    // Never leak secrets into logs.
    redact: ['config.BOT_TOKEN', 'config.YENESHOP_API_KEY', 'headers.authorization'],
  });
}
