import { env } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Sarvam AI Speech-To-Text (STT) Integration (`saaras:v3` model)
 */
export class SarvamSttService {
  private apiUrl = 'https://api.sarvam.ai/speech-to-text';

  /**
   * Transcribe an audio buffer (WAV / Opus / MP3) into text using Sarvam AI
   */
  public async transcribeAudio(
    audioBuffer: Buffer,
    languageCode: 'en-IN' | 'hi-IN' | 'unknown' = 'en-IN'
  ): Promise<string> {
    if (!env.SARVAM_API_KEY || env.SARVAM_API_KEY.includes('dummy')) {
      logger.warn('[Sarvam STT] SARVAM_API_KEY not configured or dummy.');
      return '';
    }

    try {
      logger.info(`[Sarvam STT] Transcribing audio buffer (${audioBuffer.length} bytes), language: ${languageCode}`);

      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: 'audio/wav' });
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
