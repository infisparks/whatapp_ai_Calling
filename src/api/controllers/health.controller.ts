import { Request, Response } from 'express';
import { env } from '../../config/env.config';

export class HealthController {
  public getHealth(_req: Request, res: Response): void {
    const memoryUsage = process.memoryUsage();
    
    res.status(200).json({
      success: true,
      service: 'Infiplus AI WhatsApp Calling Agent',
      domain: env.DOMAIN,
      environment: env.NODE_ENV,
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: {
          rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
          heapTotalMb: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
          heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        },
      },
      phase: 'Phase 1 - WhatsApp Webhook & Calling Core Enabled',
    });
  }
}

export const healthController = new HealthController();
