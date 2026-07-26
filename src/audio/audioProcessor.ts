import OpusScript from 'opusscript';
import { logger } from '../utils/logger';

/**
 * Audio Processor using OpusScript to encode and decode OPUS / PCM WebRTC RTP audio
 */
export class AudioProcessor {
  private static encoder = new OpusScript(48000, 1, OpusScript.Application.VOIP);
  private static decoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);

  /**
   * Convert Sarvam TTS WAV/PCM Buffer into an array of encoded OPUS frames (20ms per frame)
   */
  public static encodeWavToOpusFrames(wavBuffer: Buffer): Buffer[] {
    try {
      // Strip 44-byte WAV header if present
      let pcmData = wavBuffer;
      if (wavBuffer.length > 44 && wavBuffer.toString('utf-8', 0, 4) === 'RIFF') {
        pcmData = wavBuffer.subarray(44);
      }

      const opusFrames: Buffer[] = [];
      // 960 samples @ 48kHz mono = 1920 bytes (20ms frame size)
      const frameSizeSamples = 960;
      const frameSizeBytes = frameSizeSamples * 2;

      for (let offset = 0; offset < pcmData.length; offset += frameSizeBytes) {
        const chunk = pcmData.subarray(offset, offset + frameSizeBytes);
        if (chunk.length < frameSizeBytes) {
          // Pad remaining frame with zeroes
          const padded = Buffer.alloc(frameSizeBytes);
          chunk.copy(padded);
          const encoded = AudioProcessor.encoder.encode(padded, frameSizeSamples);
          opusFrames.push(Buffer.from(encoded));
        } else {
          const encoded = AudioProcessor.encoder.encode(chunk, frameSizeSamples);
          opusFrames.push(Buffer.from(encoded));
        }
      }

      logger.info(`[AudioProcessor] Encoded ${wavBuffer.length} bytes PCM into ${opusFrames.length} OPUS frames`);
      return opusFrames;
    } catch (error) {
      logger.error('[AudioProcessor] Error encoding PCM to OPUS:', { error });
      return [];
    }
  }

  /**
   * Decode incoming OPUS RTP payload packet into raw linear 16kHz PCM audio buffer
   */
  public static decodeOpusPacketToPcm(opusPayload: Buffer): Buffer | null {
    try {
      const decodedPcm = AudioProcessor.decoder.decode(opusPayload);
      return Buffer.from(decodedPcm);
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate volume RMS energy level of 16-bit linear PCM audio chunk
   */
  public static calculatePcmVolume(pcmBuffer: Buffer): number {
    if (!pcmBuffer || pcmBuffer.length < 2) return 0;
    let sumSq = 0;
    const sampleCount = Math.floor(pcmBuffer.length / 2);
    for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
      const sample = pcmBuffer.readInt16LE(i);
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / sampleCount);
  }
}
