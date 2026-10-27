import { pino } from 'pino';
import { env, isProd, isTest } from '../config/env.js';

/** +998901234567 → +99890***4567 */
export function maskPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  if (phone.length < 9) return '***';
  return `${phone.slice(0, 6)}***${phone.slice(-4)}`;
}

export const logger = pino({
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',
  base: { env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.headers["x-telegram-init-data"]',
      '*.password',
      'req.headers["x-bot-secret"]',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.tokenHash',
      '*.phone',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd || isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }),
});
