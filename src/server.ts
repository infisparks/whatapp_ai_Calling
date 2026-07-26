import http from 'http';
import app from './app';
import { env } from './config/env.config';
import { logger } from './utils/logger';

const server = http.createServer(app);

const port = env.PORT;
const host = env.HOST;

server.listen(port, host, () => {
  logger.info(`==================================================`);
  logger.info(`🚀 Infiplus AI WhatsApp Calling Agent Server Running`);
  logger.info(`Environment : ${env.NODE_ENV}`);
  logger.info(`Address     : http://${host}:${port}`);
  logger.info(`Domain      : ${env.DOMAIN}`);
  logger.info(`Webhook URL : ${env.DOMAIN}/api/v1/whatsapp/webhook`);
  logger.info(`Health Check: ${env.DOMAIN}/api/v1/health`);
  logger.info(`==================================================`);
});

// Graceful Shutdown Handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', { error });
});
