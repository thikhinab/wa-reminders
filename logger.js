import pino from 'pino';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: require.resolve('pino-pretty'),
      options: { colorize: true }
    }
  })
});