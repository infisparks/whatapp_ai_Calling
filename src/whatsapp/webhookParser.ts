import { ParsedCallInfo, WhatsAppWebhookPayload } from '../types/whatsapp.types';
import { logger } from '../utils/logger';

/**
 * Parses incoming WhatsApp Webhook payloads to extract call objects and call signaling details
 */
export class WebhookParser {
  /**
   * Extract array of ParsedCallInfo objects from raw WhatsApp Webhook body
   */
  public static parseCallEvents(body: WhatsAppWebhookPayload): ParsedCallInfo[] {
    const callEvents: ParsedCallInfo[] = [];

    if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
      logger.debug('[WebhookParser] Payload is not a whatsapp_business_account or entry is empty');
      return callEvents;
    }

    for (const entry of body.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field !== 'calls' && change.field !== 'messages') {
          continue;
        }

        const value = change.value;
        const businessPhoneNumberId = value?.metadata?.phone_number_id || '';

        // Handle direct call object array in calls field
        if (Array.isArray(value.calls)) {
          for (const callObj of value.calls) {
            if (!callObj.id || !callObj.from) {
              logger.warn('[WebhookParser] Call object missing id or from parameters', callObj);
              continue;
            }

            const parsedCall: ParsedCallInfo = {
              callId: callObj.id,
              callerPhoneNumber: callObj.from,
              businessPhoneNumberId,
              eventType: callObj.event || 'incoming',
              timestamp: callObj.timestamp || new Date().toISOString(),
              sdpOffer: callObj.session?.sdp,
              audioCodec: callObj.audio?.codec,
              rawCallObject: callObj,
            };

            callEvents.push(parsedCall);
          }
        }
      }
    }

    logger.info(`[WebhookParser] Extracted ${callEvents.length} call event(s) from webhook payload`);
    return callEvents;
  }

  /**
   * Check if payload is a standard webhook verification ping
   */
  public static isWebhookVerification(query: Record<string, unknown>): boolean {
    return (
      query['hub.mode'] === 'subscribe' &&
      typeof query['hub.verify_token'] === 'string' &&
      typeof query['hub.challenge'] === 'string'
    );
  }
}
