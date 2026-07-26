import { logger } from '../../utils/logger';

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
  id: string;
}

export interface GeminiServerMessage {
  setupComplete?: Record<string, any>;
  serverContent?: {
    modelTurn?: {
      parts?: GeminiPart[];
    };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
  toolCall?: {
    functionCalls?: GeminiFunctionCall[];
  };
  toolCallCancellation?: {
    ids?: string[];
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface ParsedGeminiEvent {
  type: 'setupComplete' | 'audio' | 'text' | 'turnComplete' | 'interrupted' | 'toolCall' | 'error' | 'unknown';
  callId?: string;
  audioChunk?: Buffer;
  text?: string;
  functionCalls?: GeminiFunctionCall[];
  errorDetails?: { code: number; message: string; status: string };
  raw?: GeminiServerMessage;
}

/**
 * Event parser for incoming Gemini Live WebSocket BidiServerMessage frames
 */
export class GeminiEventParser {
  /**
   * Parse incoming WebSocket frame (buffer or text) into a structured ParsedGeminiEvent
   */
  public static parse(data: Buffer | string, callId: string): ParsedGeminiEvent[] {
    const events: ParsedGeminiEvent[] = [];

    try {
      const rawText = typeof data === 'string' ? data : data.toString('utf-8');
      const message: GeminiServerMessage = JSON.parse(rawText);

      // 1. Setup Complete Signal
      if (message.setupComplete) {
        logger.info(`[GeminiEventParser] [Call ${callId}] Received SetupComplete from Gemini Live API`);
        events.push({ type: 'setupComplete', callId, raw: message });
      }

      // 2. Server Content (Audio / Text / Interrupted / Turn Complete)
      if (message.serverContent) {
        const { modelTurn, turnComplete, interrupted } = message.serverContent;

        if (interrupted) {
          logger.info(`[GeminiEventParser] [Call ${callId}] Gemini Live signal: Interrupted by caller (Barge-in)`);
          events.push({ type: 'interrupted', callId, raw: message });
        }

        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            // Audio Part
            if (part.inlineData?.data) {
              const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
              events.push({
                type: 'audio',
                callId,
                audioChunk: audioBuffer,
                raw: message,
              });
            }

            // Text Part (Transcript / Debug)
            if (part.text) {
              events.push({
                type: 'text',
                callId,
                text: part.text,
                raw: message,
              });
            }
          }
        }

        if (turnComplete) {
          logger.debug(`[GeminiEventParser] [Call ${callId}] Gemini Live signal: Turn Complete`);
          events.push({ type: 'turnComplete', callId, raw: message });
        }
      }

      // 3. Tool Calls (Function Calling)
      if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
        logger.info(`[GeminiEventParser] [Call ${callId}] Received Tool Call request from Gemini:`, {
          tools: message.toolCall.functionCalls.map((fc) => fc.name),
        });
        events.push({
          type: 'toolCall',
          callId,
          functionCalls: message.toolCall.functionCalls,
          raw: message,
        });
      }

      // 4. Error Message
      if (message.error) {
        logger.error(`[GeminiEventParser] [Call ${callId}] Gemini Live Error Frame:`, message.error);
        events.push({
          type: 'error',
          callId,
          errorDetails: message.error,
          raw: message,
        });
      }

      if (events.length === 0) {
        events.push({ type: 'unknown', callId, raw: message });
      }
    } catch (err) {
      logger.error(`[GeminiEventParser] [Call ${callId}] Failed to parse WebSocket message from Gemini Live:`, { err });
      events.push({
        type: 'error',
        callId,
        errorDetails: { code: 500, message: 'Invalid JSON payload from Gemini API', status: 'PARSE_ERROR' },
      });
    }

    return events;
  }
}
