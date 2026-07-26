import { env } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Prepend standard 44-byte RIFF WAV header to raw audio PCM buffers
 */
function addWavHeader(pcmData: Buffer, sampleRate = 16000, numChannels = 1, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44);
  
  // "RIFF" chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);

  // "fmt " sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
  header.writeUInt16LE(numChannels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);

  // "data" sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Sarvam AI Speech-To-Text (STT) Integration (`saaras:v3` model)
 */
export class SarvamSttService {
  private apiUrl = 'https://api.sarvam.ai/speech-to-text';

  /**
   * Transcribe an audio buffer into text using Sarvam AI
   */
  public async transcribeAudio(
    rawAudioBuffer: Buffer,
    languageCode: 'en-IN' | 'hi-IN' | 'unknown' = 'en-IN'
  ): Promise<string> {
    if (!env.SARVAM_API_KEY || env.SARVAM_API_KEY.includes('dummy')) {
      logger.warn('[Sarvam STT] SARVAM_API_KEY not configured or dummy.');
      return '';
    }

    try {
      // Prepend WAV header so Sarvam API recognizes standard WAV container format
      const wavBuffer = addWavHeader(rawAudioBuffer, 16000, 1, 16);
      logger.info(`[Sarvam STT] Transcribing audio buffer (${wavBuffer.length} bytes), language: ${languageCode}`);

      const formData = new FormData();
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      formData.append('file', blob, 'recording.wav');
      formData.append('model', 'saaras:v3');
      formData.append('language_code', languageCode === 'unknown' ? 'en-IN' : languageCode);
      formData.append('mode', 'transcribe');

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'api-subscription-key': env.SARVAM_API_KEY,
        },
        body: formData,
      });

      const responseData = (await response.json()) as { transcript?: string };

      if (response.ok && responseData.transcript) {
        const transcript = responseData.transcript.trim();
        logger.info(`[Sarvam STT] Transcribed successfully: "${transcript}"`);
        return transcript;
      } else {
        logger.error('[Sarvam STT] API returned error:', responseData);
        return '';
      }
    } catch (error) {
      logger.error('[Sarvam STT] Exception during transcription:', { error });
      return '';
    }
  }
}

export const sarvamSttService = new SarvamSttService();
