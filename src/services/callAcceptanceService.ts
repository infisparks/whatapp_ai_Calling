import { CallAcceptanceResult, ParsedCallInfo } from '../types/whatsapp.types';
import { SdpParser } from '../webrtc/sdpParser';
import { callSessionManager } from '../whatsapp/callSessionManager';
import { whatsappClient } from '../whatsapp/whatsappClient';
import { logger } from '../utils/logger';

/**
 * Service handling incoming call acceptance pipeline
 */
export class CallAcceptanceService {
  /**
   * Process incoming call offer, log details, parse SDP, register session, and accept call
   */
  public async processIncomingCall(callInfo: ParsedCallInfo): Promise<CallAcceptanceResult> {
    logger.info(`==================================================`);
    logger.info(`[CallAcceptanceService] INCOMING CALL DETECTED`);
    logger.info(`Call ID: ${callInfo.callId}`);
    logger.info(`Caller Number: ${callInfo.callerPhoneNumber}`);
    logger.info(`Business Number ID: ${callInfo.businessPhoneNumberId}`);
    logger.info(`Event Type: ${callInfo.eventType}`);
    logger.info(`Timestamp: ${callInfo.timestamp}`);
    logger.info(`==================================================`);

    try {
      // 1. Parse SDP Offer if present
      let parsedSdp;
      if (callInfo.sdpOffer) {
        logger.info(`[CallAcceptanceService] Parsing SDP Offer for Call ID ${callInfo.callId}`);
        parsedSdp = SdpParser.parse(callInfo.sdpOffer);
      } else {
        logger.warn(`[CallAcceptanceService] No SDP Offer string present in call event for Call ID ${callInfo.callId}`);
      }

      // 2. Register Call Session in session manager
      const session = callSessionManager.registerCall(callInfo, parsedSdp);

      // 3. Check call event type
      if (callInfo.eventType === 'terminate' || callInfo.eventType === 'rejected') {
        logger.info(`[CallAcceptanceService] Call ${callInfo.callId} ended by remote user (${callInfo.eventType})`);
        callSessionManager.removeSession(callInfo.callId);
        return {
          success: true,
          callId: callInfo.callId,
          status: 'TERMINATED',
          message: `Call marked as ${callInfo.eventType}`,
        };
      }

      // 4. Update status to ACCEPTING
      callSessionManager.updateStatus(callInfo.callId, 'ACCEPTING');

      // 5. Generate SDP Answer boilerplate for Phase 1
      const sdpAnswer = parsedSdp 
        ? SdpParser.generateBoilerplateAnswer(parsedSdp)
        : 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Infiplus AI\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 9000 RTP/SAVPF 111\r\n';

      // 6. Send Call Acceptance signal to WhatsApp API
      const accepted = await whatsappClient.acceptCall(
        callInfo.callId,
        sdpAnswer,
        callInfo.businessPhoneNumberId
      );

      if (accepted) {
        callSessionManager.updateStatus(callInfo.callId, 'CONNECTED', sdpAnswer);
        logger.info(`[CallAcceptanceService] ✅ Successfully accepted call ${callInfo.callId}`);

        return {
          success: true,
          callId: callInfo.callId,
          status: 'CONNECTED',
          sdpAnswer,
          message: 'Call accepted successfully',
        };
      } else {
        callSessionManager.updateStatus(callInfo.callId, 'FAILED');
        logger.error(`[CallAcceptanceService] ❌ Failed to accept call ${callInfo.callId} via WhatsApp API`);

        return {
          success: false,
          callId: callInfo.callId,
          status: 'FAILED',
          message: 'Failed to accept call via WhatsApp Business API',
        };
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[CallAcceptanceService] Error processing incoming call ${callInfo.callId}:`, { error });

      callSessionManager.updateStatus(callInfo.callId, 'FAILED');

      return {
        success: false,
        callId: callInfo.callId,
        status: 'FAILED',
        message: 'Exception in call acceptance service',
        error: errMessage,
      };
    }
  }
}

export const callAcceptanceService = new CallAcceptanceService();
