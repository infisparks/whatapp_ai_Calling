import { CallSession, CallSessionStatus, ParsedCallInfo, ParsedSdpInfo } from '../types/whatsapp.types';
import { logger } from '../utils/logger';

/**
 * In-memory manager for active WhatsApp Voice Call Sessions
 */
export class CallSessionManager {
  private static instance: CallSessionManager;
  private sessions: Map<string, CallSession> = new Map();

  private constructor() {}

  public static getInstance(): CallSessionManager {
    if (!CallSessionManager.instance) {
      CallSessionManager.instance = new CallSessionManager();
    }
    return CallSessionManager.instance;
  }

  /**
   * Create or update a call session from parsed call info
   */
  public registerCall(callInfo: ParsedCallInfo, parsedSdp?: ParsedSdpInfo): CallSession {
    const existing = this.sessions.get(callInfo.callId);

    if (existing) {
      existing.updatedAt = new Date();
      if (callInfo.sdpOffer) existing.sdpOffer = callInfo.sdpOffer;
      if (parsedSdp) existing.parsedSdp = parsedSdp;
      logger.info(`[CallSessionManager] Updated existing session: ${callInfo.callId}`);
      return existing;
    }

    const newSession: CallSession = {
      callId: callInfo.callId,
      callerPhoneNumber: callInfo.callerPhoneNumber,
      status: 'INCOMING',
      createdAt: new Date(),
      updatedAt: new Date(),
      sdpOffer: callInfo.sdpOffer,
      parsedSdp,
      metadata: {
        businessPhoneNumberId: callInfo.businessPhoneNumberId,
        eventType: callInfo.eventType,
      },
    };

    this.sessions.set(callInfo.callId, newSession);
    logger.info(`[CallSessionManager] Registered new call session: ${callInfo.callId} from ${callInfo.callerPhoneNumber}`);
    return newSession;
  }

  /**
   * Update session status
   */
  public updateStatus(callId: string, status: CallSessionStatus, sdpAnswer?: string): CallSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) {
      logger.warn(`[CallSessionManager] Session not found for status update: ${callId}`);
      return undefined;
    }

    session.status = status;
    session.updatedAt = new Date();
    if (sdpAnswer) {
      session.sdpAnswer = sdpAnswer;
    }

    logger.info(`[CallSessionManager] Session ${callId} status changed to ${status}`);
    return session;
  }

  /**
   * Get call session by Call ID
   */
  public getSession(callId: string): CallSession | undefined {
    return this.sessions.get(callId);
  }

  /**
   * List all active sessions
   */
  public getAllSessions(): CallSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Terminate and remove a session
   */
  public removeSession(callId: string): boolean {
    const session = this.sessions.get(callId);
    if (session) {
      session.status = 'TERMINATED';
      session.updatedAt = new Date();
      this.sessions.delete(callId);
      logger.info(`[CallSessionManager] Removed call session: ${callId}`);
      return true;
    }
    return false;
  }
}

export const callSessionManager = CallSessionManager.getInstance();
