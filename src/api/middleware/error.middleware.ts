import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

/**
 * Global Express Error Handling Middleware
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`[Global Error Handler] Code ${statusCode}: ${message}`, {
    url: req.originalUrl,
    method: req.method,
    stack: err.stack,
    details: err.details,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack, details: err.details }),
    },
  });
};
