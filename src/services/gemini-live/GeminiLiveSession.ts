import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { env } from '../../config/env.config';
import { geminiLiveConfig } from '../../config/GeminiLiveConfig';
import { realtimeConfig } from '../../config/RealtimeConfig';
import { logger } from '../../utils/logger';
import { GeminiEventParser, GeminiFunctionCall, ParsedGeminiEvent } from './GeminiEventParser';

export interface GeminiLiveSessionOptions {
  callId: string;
  systemInstruction: string;
  voiceName?: string;
  tools?: Array<Record<string, any>>;
  apiKey?: string;
}

export declare interface GeminiLiveSession {
  on(event: 'open', listener: () => void): this;
  on(event: 'setupComplete', listener: () => void): this;
  on(event: 'audio', listener: (audioChunk: Buffer, latencyMs: number) => void): this;
  on(event: 'text', listener: (text: string) => void): this;
  on(event: 'interrupted', listener: () => void): this;
  on(event: 'turnComplete', listener: () => void): this;
  on(event: 'toolCall', listener: (functionCalls: GeminiFunctionCall[]) => void): this;
  on(event: 'error', listener: (error: any) => void): this;
  on(event: 'close', listener: (code: number, reason: string) => void): this;
}

/**
 * Gemini Live API Individual Call Session Manager
 */
export class GeminiLiveSession extends EventEmitter {
  public readonly callId: string;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private isSetupComplete: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectCount: number = 0;
  private isManuallyClosed: boolean = false;
  private options: GeminiLiveSessionOptions;
  private lastAudioSentTime: number = 0;

  constructor(options: GeminiLiveSessionOptions) {
    super();
    this.callId = options.callId;
    this.options = options;
  }

  /**
   * Connect to Gemini Live WebSocket API and send Setup Handshake
   */
  public async connect(): Promise<void> {
    const apiKey = this.options.apiKey || env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('dummy')) {
      logger.warn(`[GeminiLiveSession] [Call ${this.callId}] Gemini API key missing or dummy. Session running in fallback mode.`);
      this.emit('error', new Error('Gemini API key is invalid or dummy'));
      return;
    }

    const wsUrl = `${geminiLiveConfig.wsUrl}?key=${apiKey}`;
    logger.info(`[GeminiLiveSession] [Call ${this.callId}] Connecting to Gemini Live API WebSocket...`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          logger.info(`[GeminiLiveSession] [Call ${this.callId}] ✅ WebSocket connection established with Gemini Live API`);
          this.isConnected = true;
          this.reconnectCount = 0;
          this.sendInitialSetupHandshake();
          this.startHeartbeat();
          this.emit('open');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleIncomingMessage(data);
        });

        this.ws.on('error', (err: Error) => {
          logger.error(`[GeminiLiveSession] [Call ${this.callId}] WebSocket Error:`, { err: err.message });
          this.emit('error', err);
          if (!this.isConnected) reject(err);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          const reasonStr = reason.toString('utf-8');
          logger.warn(`[GeminiLiveSession] [Call ${this.callId}] WebSocket connection closed. Code: ${code}, Reason: "${reasonStr}"`);
          this.handleDisconnect(code, reasonStr);
        });
      } catch (error) {
        logger.error(`[GeminiLiveSession] [Call ${this.callId}] Exception initiating WebSocket:`, { error });
        reject(error);
      }
    });
  }

  /**
   * Send initial setup payload containing system instruction & tools ONLY ONCE
   */
  private sendInitialSetupHandshake(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const rawModel = geminiLiveConfig.model;
    const modelName = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;

    const setupPayload: Record<string, any> = {
      setup: {
        model: modelName,
        generationConfig: {
          responseModalities: geminiLiveConfig.responseModalities,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.options.voiceName || geminiLiveConfig.voiceName,
              },
            },
          },
          temperature: geminiLiveConfig.temperature,
          maxOutputTokens: geminiLiveConfig.maxOutputTokens,
        },
        systemInstruction: {
          parts: [{ text: this.options.systemInstruction }],
        },
      },
    };

    if (this.options.tools && this.options.tools.length > 0) {
      setupPayload.setup.tools = this.options.tools;
    }

    logger.info(`[GeminiLiveSession] [Call ${this.callId}] Sending initial Setup Handshake payload (System Prompt & Tools)...`);
    this.ws.send(JSON.stringify(setupPayload));
  }

  /**
   * Process incoming WebSocket data frame
   */
  private handleIncomingMessage(data: WebSocket.Data): void {
    const rawBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
    const events: ParsedGeminiEvent[] = GeminiEventParser.parse(rawBuffer, this.callId);

    for (const event of events) {
      switch (event.type) {
        case 'setupComplete':
          this.isSetupComplete = true;
          logger.info(`[GeminiLiveSession] [Call ${this.callId}] Gemini Live Session Setup Handshake Confirmed`);
          this.emit('setupComplete');
          break;

        case 'audio':
          if (event.audioChunk) {
            const latencyMs = this.lastAudioSentTime > 0 ? Date.now() - this.lastAudioSentTime : 0;
            logger.debug(`[GeminiLiveSession] [Call ${this.callId}] Audio frame received (${event.audioChunk.length} bytes, Latency: ${latencyMs}ms)`);
            this.emit('audio', event.audioChunk, latencyMs);
          }
          break;

        case 'text':
          if (event.text) {
            logger.info(`[GeminiLiveSession] [Call ${this.callId}] Text transcript: "${event.text}"`);
            this.emit('text', event.text);
          }
          break;

        case 'interrupted':
          logger.info(`[GeminiLiveSession] [Call ${this.callId}] Interrupted event received`);
          this.emit('interrupted');
          break;

        case 'turnComplete':
          logger.debug(`[GeminiLiveSession] [Call ${this.callId}] Turn complete`);
          this.emit('turnComplete');
          break;

        case 'toolCall':
          if (event.functionCalls) {
            logger.info(`[GeminiLiveSession] [Call ${this.callId}] Triggering tool calls:`, event.functionCalls);
            this.emit('toolCall', event.functionCalls);
          }
          break;

        case 'error':
          logger.error(`[GeminiLiveSession] [Call ${this.callId}] Gemini Error:`, event.errorDetails);
          this.emit('error', event.errorDetails);
          break;

        default:
          break;
      }
    }
  }

  /**
   * Send 16kHz linear 16-bit PCM audio frame to Gemini Live Session
   */
  public sendAudioFrame(pcm16Buffer: Buffer): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return false;
    }

    try {
      this.lastAudioSentTime = Date.now();
      const base64Audio = pcm16Buffer.toString('base64');
      const payload = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Audio,
            },
          ],
        },
      };

      this.ws.send(JSON.stringify(payload));
      logger.debug(`[GeminiLiveSession] [Call ${this.callId}] Dispatched ${pcm16Buffer.length} bytes PCM audio frame`);
      return true;
    } catch (err) {
      logger.error(`[GeminiLiveSession] [Call ${this.callId}] Error sending audio frame:`, { err });
      return false;
    }
  }

  /**
   * Send Tool Call Response back to Gemini Live
   */
  public sendToolResponse(functionResponses: Array<{ id: string; name: string; response: Record<string, any> }>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`[GeminiLiveSession] [Call ${this.callId}] Cannot send tool response: WS not connected`);
      return false;
    }

    try {
      const payload = {
        toolResponse: {
          functionResponses: functionResponses.map((fr) => ({
            id: fr.id,
            name: fr.name,
            response: { output: fr.response },
          })),
        },
      };

      logger.info(`[GeminiLiveSession] [Call ${this.callId}] Dispatching tool responses to Gemini:`, functionResponses);
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      logger.error(`[GeminiLiveSession] [Call ${this.callId}] Error sending tool response:`, { err });
      return false;
    }
  }

  /**
   * Send text input message to session
   */
  public sendTextMessage(text: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return false;
    }

    try {
      const payload = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      };

      logger.info(`[GeminiLiveSession] [Call ${this.callId}] Sending client text message: "${text}"`);
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      logger.error(`[GeminiLiveSession] [Call ${this.callId}] Error sending text message:`, { err });
      return false;
    }
  }

  /**
   * Handle WebSocket disconnect and trigger reconnect policy if appropriate
   */
  private handleDisconnect(code: number, reason: string): void {
    this.isConnected = false;
    this.isSetupComplete = false;
    this.stopHeartbeat();

    this.emit('close', code, reason);

    if (!this.isManuallyClosed && this.reconnectCount < geminiLiveConfig.reconnectAttempts) {
      this.reconnectCount++;
      const delay = geminiLiveConfig.reconnectBaseDelayMs * Math.pow(2, this.reconnectCount - 1);
      logger.info(`[GeminiLiveSession] [Call ${this.callId}] Attempting automatic reconnect ${this.reconnectCount}/${geminiLiveConfig.reconnectAttempts} in ${delay}ms...`);
      setTimeout(() => {
        this.connect().catch((err) => {
          logger.error(`[GeminiLiveSession] [Call ${this.callId}] Reconnect attempt ${this.reconnectCount} failed:`, { err });
        });
      }, delay);
    }
  }

  /**
   * Periodic WebSocket ping keep-alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, realtimeConfig.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Manually close Live session
   */
  public close(reason: string = 'Call ended'): void {
    this.isManuallyClosed = true;
    this.stopHeartbeat();

    if (this.ws) {
      logger.info(`[GeminiLiveSession] [Call ${this.callId}] Closing live session cleanly. Reason: ${reason}`);
      try {
        this.ws.close(1000, reason);
      } catch (err) {
        logger.error(`[GeminiLiveSession] [Call ${this.callId}] Error closing WebSocket:`, { err });
      }
      this.ws = null;
    }

    this.isConnected = false;
    this.isSetupComplete = false;
  }

  public getIsConnected(): boolean {
    return this.isConnected && this.isSetupComplete;
  }
}
