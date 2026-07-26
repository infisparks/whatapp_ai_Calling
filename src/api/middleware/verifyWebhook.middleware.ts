import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.config';
import { logger } from '../../utils/logger';

/**
 * Middleware for WhatsApp Webhook Security Verification
 */

/**
 * GET Verification Middleware (hub.verify_token check)
 */
export const verifyWebhookToken = (req: Request, res: Response, next: NextFunction): void => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  logger.info('[Webhook Verification] Attempting GET verification:', { mode, token, challengePresent: !!challenge });

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('✅ [Webhook Verification] Token verified successfully!');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('❌ [Webhook Verification] Verification token mismatch or invalid mode', {
    expectedToken: env.WHATSAPP_VERIFY_TOKEN,
    receivedToken: token,
    mode,
  });

  res.status(403).json({
    error: 'Verification failed',
    message: 'hub.verify_token does not match configured token',
  });
};

/**
 * POST Webhook Payload HMAC SHA256 Signature Verification Middleware
 */
export const verifyWebhookSignature = (req: Request, res: Response, next: NextFunction): void => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!env.WHATSAPP_APP_SECRET || env.WHATSAPP_APP_SECRET === '0123456789abcdef0123456789abcdef') {
    // Skip signature check in dev mode if secret is not set
    logger.debug('[Webhook Signature] Skipping payload HMAC verification (App secret not set or default)');
    next();
    return;
  }

  if (!signature) {
    logger.warn('[Webhook Signature] Missing X-Hub-Signature-256 header in request');
    res.status(401).json({ error: 'Unauthorized', message: 'Missing X-Hub-Signature-256 header' });
    return;
  }

  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body));
    const hmac = crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET);
    const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      logger.error('[Webhook Signature] Invalid X-Hub-Signature-256');
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid payload signature' });
      return;
    }

    next();
  } catch (error) {
    logger.error('[Webhook Signature] Exception checking signature:', { error });
    res.status(500).json({ error: 'Internal server error during signature check' });
  }
};
