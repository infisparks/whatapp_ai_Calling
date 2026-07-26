import { logger } from '../../utils/logger';
import { GeminiLiveSession } from './GeminiLiveSession';
import { peerConnectionManager } from '../../webrtc/peerConnectionManager';
import { AudioProcessor } from '../../audio/audioProcessor';
import { audioConfig } from '../../config/AudioConfig';

/**
 * Audio Bridge managing bidirectional streaming between WebRTC PeerConnection and Gemini Live API
 */
export class GeminiAudioBridge {
  private callId: string;
  private session: GeminiLiveSession;
  private isInterrupted: boolean = false;
  private outputAudioQueue: Buffer[] = [];
  private isProcessingQueue: boolean = false;

  constructor(callId: string, session: GeminiLiveSession) {
    this.callId = callId;
    this.session = session;

    this.bindSessionEvents();
  }

  /**
   * Bind event handlers to Gemini Live Session
   */
  private bindSessionEvents(): void {
    // When Gemini outputs audio frame (24kHz linear PCM 16-bit LE)
    this.session.on('audio', (audioChunk: Buffer, latencyMs: number) => {
      if (this.isInterrupted) {
        logger.debug(`[GeminiAudioBridge] [Call ${this.callId}] Dropping incoming audio frame due to active interruption signal`);
        return;
      }

      logger.debug(`[GeminiAudioBridge] [Call ${this.callId}] Received audio from Gemini Live (${audioChunk.length} bytes, Latency: ${latencyMs}ms)`);
      this.enqueueOutputAudio(audioChunk);
    });

    // When Gemini indicates model turn was interrupted by caller speech
    this.session.on('interrupted', () => {
      logger.info(`[GeminiAudioBridge] [Call ${this.callId}] 🛑 Gemini Live Interrupted signal received. Flushing WebRTC output queue.`);
      this.handleInterruption();
    });

    // When Gemini turn finishes
    this.session.on('turnComplete', () => {
      logger.debug(`[GeminiAudioBridge] [Call ${this.callId}] Model turn completed cleanly.`);
    });
  }

  /**
   * Process incoming WebRTC caller audio PCM (16kHz mono) and stream frame to Gemini Live API
   */
  public processCallerAudioChunk(pcm16kBuffer: Buffer): void {
    if (!pcm16kBuffer || pcm16kBuffer.length === 0) return;

    const volume = AudioProcessor.calculatePcmVolume(pcm16kBuffer);

    // If caller speaks loudly during model response -> trigger instant local interruption
    if (this.outputAudioQueue.length > 0 && volume > audioConfig.bargeInThresholdRms) {
      logger.info(`[GeminiAudioBridge] [Call ${this.callId}] 🛑 Caller loud speech detected (RMS: ${Math.round(volume)}). Interrupting AI output!`);
      this.handleInterruption();
    }

    // Only forward speech chunks above background noise threshold
    if (volume > audioConfig.speechNoiseThresholdRms) {
      this.isInterrupted = false; // Reset interrupt lock on new valid speech
      this.session.sendAudioFrame(pcm16kBuffer);
    }
  }

  /**
   * Enqueue model PCM audio for streaming over WebRTC
   */
  private enqueueOutputAudio(pcm24kChunk: Buffer): void {
    this.outputAudioQueue.push(pcm24kChunk);
    if (!this.isProcessingQueue) {
      this.processOutputQueue().catch((err) => {
        logger.error(`[GeminiAudioBridge] [Call ${this.callId}] Exception in output audio stream queue:`, { err });
      });
    }
  }

  /**
   * Stream output audio queue in real-time over WebRTC PeerConnection
   */
  private async processOutputQueue(): Promise<void> {
    this.isProcessingQueue = true;

    while (this.outputAudioQueue.length > 0) {
      if (this.isInterrupted) {
        logger.info(`[GeminiAudioBridge] [Call ${this.callId}] Clearing ${this.outputAudioQueue.length} queued audio chunks due to interruption`);
        this.outputAudioQueue = [];
        break;
      }

      const pcmChunk = this.outputAudioQueue.shift();
      if (!pcmChunk || pcmChunk.length === 0) continue;

      // Resample 24kHz PCM from Gemini to 16kHz for Opus conversion (or encode directly)
      const pcm16k = AudioProcessor.resamplePcm(pcmChunk, 24000, 16000);
      const opusFrames = AudioProcessor.encodePcmToOpusFrames(pcm16k);

      if (opusFrames.length > 0) {
        await peerConnectionManager.streamOpusFramesToCall(this.callId, opusFrames, () => this.isInterrupted);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Handle caller barge-in / interruption
   */
  public handleInterruption(): void {
    this.isInterrupted = true;
    this.outputAudioQueue = [];
    peerConnectionManager.stopCallPlayback(this.callId);
  }

  /**
   * Clear audio bridge resources
   */
  public destroy(): void {
    this.isInterrupted = true;
    this.outputAudioQueue = [];
    logger.debug(`[GeminiAudioBridge] [Call ${this.callId}] Audio bridge destroyed.`);
  }
}
