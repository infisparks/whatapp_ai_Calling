import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

/**
 * Express middleware to log incoming HTTP requests
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    const logMsg = `[HTTP] ${method} ${originalUrl} ${statusCode} - ${duration}ms (IP: ${ip})`;
    if (statusCode >= 400) {
      logger.warn(logMsg);
    } else {
      logger.info(logMsg);
    }
  });

  next();
};
