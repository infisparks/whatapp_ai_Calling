import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRoutes from './api/routes';
import { requestLogger } from './api/middleware/requestLogger.middleware';
import { errorHandler } from './api/middleware/error.middleware';

const app: Application = express();

// Security Headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(cors({ origin: true, credentials: true }));

// Body Parser with Raw Body Preservation for Webhook Signature Verification
app.use(
  express.json({
    limit: '10mb',
    verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom HTTP Request Logger
app.use(requestLogger);

// API v1 Routes
app.use('/api/v1', apiRoutes);

// Root Health & Metadata Route
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'Infiplus AI WhatsApp Calling Agent API',
    status: 'ACTIVE',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// 404 Fallback Handler
app.use((req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
    },
  });
});

// Global Error Handler Middleware
app.use(errorHandler);

export default app;
