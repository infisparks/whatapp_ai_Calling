import { Router } from 'express';
import { whatsAppController } from '../controllers/whatsapp.controller';
import { verifyWebhookToken, verifyWebhookSignature } from '../middleware/verifyWebhook.middleware';

const router = Router();

/**
 * @route   GET /api/v1/whatsapp/webhook
 * @desc    Verify WhatsApp Webhook Subscriptions (hub.verify_token)
 */
router.get('/webhook', verifyWebhookToken, (req, res) => whatsAppController.verifyWebhook(req, res));

/**
 * @route   POST /api/v1/whatsapp/webhook
 * @desc    Receive incoming WhatsApp Business Call Events & Messages
 */
router.post('/webhook', verifyWebhookSignature, (req, res, next) => {
  whatsAppController.handleWebhookEvent(req, res, next);
});

/**
 * @route   GET /api/v1/whatsapp/sessions
 * @desc    Get list of active call sessions (Monitoring)
 */
router.get('/sessions', (req, res) => whatsAppController.getActiveSessions(req, res));

export default router;
