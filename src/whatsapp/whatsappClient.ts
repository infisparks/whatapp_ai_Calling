import { env } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Official WhatsApp Business Calling API Client
 * Handles signaling requests to Graph API for Call Acceptance, Answer SDP transmission, and Termination
 */
export class WhatsAppClient {
  private apiVersion = 'v21.0';
  private baseUrl = 'https://graph.facebook.com';
  public lastApiResponse: unknown = null;

  /**
   * Send Call Acceptance / SDP Answer signal to WhatsApp Business Calling API
   */
  public async acceptCall(callId: string, sdpAnswer: string, phoneNumberId?: string): Promise<boolean> {
    const phoneId = phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `${this.baseUrl}/${this.apiVersion}/${phoneId}/calls`;

    const payload = {
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'accept',
      session: {
        type: 'answer',
        sdp: sdpAnswer,
      },
    };

    logger.info(`[WhatsAppClient] Accepting call ${callId} via WhatsApp API endpoint: ${url}`);
    logger.debug(`[WhatsAppClient] Accept payload:`, payload);

    if (!env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN.startsWith('EAABxxxx')) {
      logger.warn(`[WhatsAppClient] Mocking WhatsApp API call acceptance for call ${callId} (Access token not configured)`);
      return true;
    }

    try {
      // Primary Attempt: POST to /{PHONE_NUMBER_ID}/calls
      let response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let responseData = await response.json();
      this.lastApiResponse = { endpoint: url, status: response.status, data: responseData };

      if (response.ok) {
        logger.info(`[WhatsAppClient] Call ${callId} accepted successfully (Primary endpoint):`, responseData);
        return true;
      }

      logger.warn(`[WhatsAppClient] Primary accept call failed (${response.status}):`, responseData);

      // Fallback Attempt: POST to /{CALL_ID} directly
      const fallbackUrl = `${this.baseUrl}/${this.apiVersion}/${encodeURIComponent(callId)}`;
      logger.info(`[WhatsAppClient] Trying fallback endpoint: ${fallbackUrl}`);

      response = await fetch(fallbackUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          action: 'accept',
          session: {
            type: 'answer',
            sdp: sdpAnswer,
          },
        }),
      });

      responseData = await response.json();
      this.lastApiResponse = { endpoint: fallbackUrl, status: response.status, data: responseData };

      if (response.ok) {
        logger.info(`[WhatsAppClient] Call ${callId} accepted successfully (Fallback endpoint):`, responseData);
        return true;
      }

      logger.error(`[WhatsAppClient] Fallback accept call failed (${response.status}):`, responseData);
      return false;
    } catch (error) {
      logger.error(`[WhatsAppClient] Exception during call acceptance for ${callId}:`, { error });
      this.lastApiResponse = { error: String(error) };
      return false;
    }
  }

  /**
   * Terminate call via WhatsApp Business API
   */
  public async terminateCall(callId: string, phoneNumberId?: string): Promise<boolean> {
    const phoneId = phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID;
    const url = `${this.baseUrl}/${this.apiVersion}/${phoneId}/calls`;

    const payload = {
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'terminate',
    };

    logger.info(`[WhatsAppClient] Terminating call ${callId}`);

    if (!env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN.startsWith('EAABxxxx')) {
      logger.warn(`[WhatsAppClient] Mocking WhatsApp API call termination for call ${callId}`);
      return true;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      logger.info(`[WhatsAppClient] Call ${callId} termination response:`, responseData);
      return response.ok;
    } catch (error) {
      logger.error(`[WhatsAppClient] Exception terminating call ${callId}:`, { error });
      return false;
    }
  }
}

export const whatsappClient = new WhatsAppClient();
