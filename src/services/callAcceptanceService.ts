import { CallAcceptanceResult, ParsedCallInfo } from '../types/whatsapp.types';
import { callSessionManager } from '../whatsapp/callSessionManager';
import { whatsappClient } from '../whatsapp/whatsappClient';
import { localStorageService } from '../storage/localStorage';
import { infisparkAgent } from '../gemini/infisparkAgent';
import { sarvamTtsService } from '../sarvam/ttsService';
import { peerConnectionManager } from '../webrtc/peerConnectionManager';
import { SdpParser } from '../webrtc/sdpParser';
import { logger } from '../utils/logger';

/**
 * Service handling incoming call acceptance & AI Voice pipeline triggering
 */
export class CallAcceptanceService {
  /**
   * Process incoming call offer, parse SDP, register WebRTC PeerConnection, accept call via WhatsApp API, and trigger Infispark AI Agent greeting
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
      }

      // 2. Register Call Session in session manager
      callSessionManager.registerCall(callInfo, parsedSdp);

      // 3. Check call event type
      if (callInfo.eventType === 'terminate' || callInfo.eventType === 'rejected') {
        logger.info(`[CallAcceptanceService] Call ${callInfo.callId} ended by remote user (${callInfo.eventType})`);
        callSessionManager.removeSession(callInfo.callId);
        infisparkAgent.clearSession(callInfo.callId);
        peerConnectionManager.closeConnection(callInfo.callId);
        localStorageService.saveCallRecord(callInfo, callInfo.eventType.toUpperCase());
        localStorageService.saveSessions(callSessionManager.getAllSessions());

        return {
          success: true,
          callId: callInfo.callId,
          status: 'TERMINATED',
          message: `Call marked as ${callInfo.eventType}`,
        };
      }

      // 4. Update status to ACCEPTING
      callSessionManager.updateStatus(callInfo.callId, 'ACCEPTING');

      // 5. Generate Real WebRTC SDP Answer using werift PeerConnection Engine
      let sdpAnswer: string;
      if (callInfo.sdpOffer) {
        try {
          sdpAnswer = await peerConnectionManager.handleCallOffer(callInfo.callId, callInfo.sdpOffer);
        } catch (webrtcErr) {
          logger.error(`[CallAcceptanceService] werift PeerConnection setup failed, using boilerplate fallback:`, { webrtcErr });
          sdpAnswer = SdpParser.generateBoilerplateAnswer(parsedSdp || SdpParser.parse(callInfo.sdpOffer));
        }
      } else {
        sdpAnswer = 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9000 UDP/TLS/RTP/SAVPF 111\r\n';
      }

      // 6. Send Call Acceptance signal to WhatsApp API
      const accepted = await whatsappClient.acceptCall(
        callInfo.callId,
        sdpAnswer,
        callInfo.businessPhoneNumberId
      );

      const finalStatus = accepted ? 'CONNECTED' : 'FAILED';
      callSessionManager.updateStatus(callInfo.callId, finalStatus, sdpAnswer);
      
      // Save record to local VPS storage (JSON file)
      localStorageService.saveCallRecord(callInfo, finalStatus, sdpAnswer);
      localStorageService.saveSessions(callSessionManager.getAllSessions());

      if (accepted) {
        logger.info(`[CallAcceptanceService] ✅ Call ${callInfo.callId} CONNECTED. Triggering Infispark AI Agent opening greeting...`);

        // Trigger Infispark AI Agent greeting & Sarvam TTS speech synthesis over WebRTC
        this.triggerAiAgentGreeting(callInfo.callId).catch((err) => {
          logger.error(`[CallAcceptanceService] Error generating AI greeting for ${callInfo.callId}:`, { err });
        });

        return {
          success: true,
          callId: callInfo.callId,
          status: 'CONNECTED',
          sdpAnswer,
          message: 'Call accepted and Infispark WebRTC AI Voice Agent initialized',
        };
      } else {
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
      localStorageService.saveCallRecord(callInfo, 'FAILED');
      localStorageService.saveSessions(callSessionManager.getAllSessions());

      return {
        success: false,
        callId: callInfo.callId,
        status: 'FAILED',
        message: 'Exception in call acceptance service',
        error: errMessage,
      };
    }
  }

  /**
   * Trigger initial opening greeting from Infispark AI Agent
   */
  private async triggerAiAgentGreeting(callId: string): Promise<void> {
    const greetingText = infisparkAgent.getInitialGreeting();
    logger.info(`[CallAcceptanceService] Infispark AI Greeting: "${greetingText}"`);

    // Synthesize opening greeting via Sarvam TTS
    const speechAudioBuffer = await sarvamTtsService.synthesizeSpeech(greetingText, 'en-IN');
    if (speechAudioBuffer) {
      // Stream generated audio packets to active call over WebRTC
      await peerConnectionManager.sendTtsAudioToCall(callId, speechAudioBuffer);
      logger.info(`[CallAcceptanceService] ✅ Opening AI speech audio packets dispatched to call ${callId}`);
    }
  }
}

export const callAcceptanceService = new CallAcceptanceService();
