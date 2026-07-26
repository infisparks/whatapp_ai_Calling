import { logger } from '../../utils/logger';
import { GeminiLiveSession, GeminiLiveSessionOptions } from './GeminiLiveSession';
import { GeminiAudioBridge } from './GeminiAudioBridge';

/**
 * Service managing Gemini Live API real-time WebSocket sessions and audio bridges
 */
export class GeminiLiveService {
  private activeSessions: Map<string, GeminiLiveSession> = new Map();
  private activeBridges: Map<string, GeminiAudioBridge> = new Map();

  /**
   * Create and initialize a new Gemini Live Session for a call
   */
  public async createSession(options: GeminiLiveSessionOptions): Promise<GeminiLiveSession> {
    const { callId } = options;

    if (this.activeSessions.has(callId)) {
      logger.info(`[GeminiLiveService] Existing session found for call ${callId}. Closing old session.`);
      this.closeSession(callId);
    }

    logger.info(`[GeminiLiveService] Creating new Gemini Live API session for call ${callId}`);
    const session = new GeminiLiveSession(options);

    session.on('close', (code, reason) => {
      logger.info(`[GeminiLiveService] Session for call ${callId} closed (${code}: ${reason})`);
      this.cleanupSession(callId);
    });

    this.activeSessions.set(callId, session);

    // Establish WebSocket connection & setup handshake
    await session.connect();

    // Initialize Audio Bridge for full-duplex WebRTC streaming
    const bridge = new GeminiAudioBridge(callId, session);
    this.activeBridges.set(callId, bridge);

    return session;
  }

  /**
   * Retrieve active Gemini Live Session for a call
   */
  public getSession(callId: string): GeminiLiveSession | undefined {
    return this.activeSessions.get(callId);
  }

  /**
   * Retrieve active Gemini Audio Bridge for a call
   */
  public getAudioBridge(callId: string): GeminiAudioBridge | undefined {
    return this.activeBridges.get(callId);
  }

  /**
   * Terminate and cleanup Gemini Live session and audio bridge
   */
  public closeSession(callId: string, reason: string = 'Call terminated'): void {
    const bridge = this.activeBridges.get(callId);
    if (bridge) {
      bridge.destroy();
      this.activeBridges.delete(callId);
    }

    const session = this.activeSessions.get(callId);
    if (session) {
      session.close(reason);
      this.activeSessions.delete(callId);
    }

    logger.info(`[GeminiLiveService] Cleaned up Gemini Live resources for call ${callId}`);
  }

  private cleanupSession(callId: string): void {
    this.activeBridges.delete(callId);
    this.activeSessions.delete(callId);
  }
}

export const geminiLiveService = new GeminiLiveService();
