import { Request, Response, NextFunction } from 'express';
import { WebhookParser } from '../../whatsapp/webhookParser';
import { callAcceptanceService } from '../../services/callAcceptanceService';
import { callSessionManager } from '../../whatsapp/callSessionManager';
import { whatsappClient } from '../../whatsapp/whatsappClient';
import { WhatsAppWebhookPayload } from '../../types/whatsapp.types';
import { logger } from '../../utils/logger';

/**
 * Controller for handling WhatsApp Cloud API Webhook requests
 */
export class WhatsAppController {
  /**
   * GET /api/v1/whatsapp/webhook
   * Verification endpoint invoked by WhatsApp Meta App Settings
   */
  public verifyWebhook(req: Request, res: Response): void {
    // Logic handled by verifyWebhookToken middleware, or fallback if hit directly
    const challenge = req.query['hub.challenge'] as string | undefined;
    logger.info('[WhatsAppController] Verification GET request handled');
    res.status(200).send(challenge || 'Verification endpoint active');
  }

  /**
   * POST /api/v1/whatsapp/webhook
   * Listens to real-time events (Calls, Signaling, Messages)
   */
  public async handleWebhookEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload: WhatsAppWebhookPayload = req.body;

      logger.info('[WhatsAppController] Webhook POST event received');
      logger.debug('[WhatsAppController] Payload body:', JSON.stringify(payload, null, 2));

      // Extract call events from incoming payload
      const callEvents = WebhookParser.parseCallEvents(payload);

      if (callEvents.length === 0) {
        logger.info('[WhatsAppController] Event received (Non-call event or general status update)');
        // Respond 200 OK immediately to acknowledge WhatsApp Webhook delivery
        res.status(200).json({ status: 'success', message: 'Webhook event received (No active call action required)' });
        return;
      }

      // Respond 200 OK to WhatsApp Meta servers immediately to avoid webhook timeout
      res.status(200).json({ status: 'success', message: 'Call events processing initiated', callCount: callEvents.length });

      // Asynchronously process each call event through CallAcceptanceService
      for (const callInfo of callEvents) {
        logger.info(`[WhatsAppController] Processing call event for Call ID: ${callInfo.callId}`);
        callAcceptanceService.processIncomingCall(callInfo).catch((err) => {
          logger.error(`[WhatsAppController] Async processing error for call ${callInfo.callId}:`, { err });
        });
      }
    } catch (error) {
      logger.error('[WhatsAppController] Error processing webhook event:', { error });
      next(error);
    }
  }

  /**
   * GET /api/v1/whatsapp/sessions
   * Diagnostic endpoint to view active in-memory call sessions
   */
  public getActiveSessions(_req: Request, res: Response): void {
    const sessions = callSessionManager.getAllSessions();
    res.status(200).json({
      success: true,
      count: sessions.length,
      lastWhatsAppApiResponse: whatsappClient.lastApiResponse,
      sessions,
    });
  }
}

export const whatsAppController = new WhatsAppController();
