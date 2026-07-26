import { env } from './env.config';

/**
 * Gemini Live API WebSocket & Session Configuration Settings
 */
export interface GeminiLiveConfiguration {
  wsUrl: string;
  model: string;
  apiVersion: string;
  responseModalities: Array<'AUDIO' | 'TEXT'>;
  voiceName: string;
  temperature: number;
  maxOutputTokens: number;
  reconnectAttempts: number;
  reconnectBaseDelayMs: number;
}

export const geminiLiveConfig: GeminiLiveConfiguration = {
  wsUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
  model: env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  apiVersion: 'v1alpha',
  responseModalities: ['AUDIO'],
  voiceName: 'Puck', // Options: Puck, Charon, Kore, Fenrir, Aoede
  temperature: 0.7,
  maxOutputTokens: 1024,
  reconnectAttempts: 5,
  reconnectBaseDelayMs: 1000,
};
