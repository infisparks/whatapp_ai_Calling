import { env } from '../config/env.config';
import { logger } from '../utils/logger';

/**
 * Sarvam AI Text-To-Speech (TTS) Integration (`bulbul:v1` model)
 */
export class SarvamTtsService {
  private apiUrl = 'https://api.sarvam.ai/text-to-speech';

  /**
   * Synthesize spoken audio buffer from text input
   */
  public async synthesizeSpeech(
    text: string,
    targetLanguageCode: 'en-IN' | 'hi-IN' = 'en-IN'
  ): Promise<Buffer | null> {
    if (!env.SARVAM_API_KEY || env.SARVAM_API_KEY.includes('dummy')) {
      logger.warn('[Sarvam TTS] SARVAM_API_KEY not configured or dummy.');
      return null;
    }

    try {
      logger.info(`[Sarvam TTS] Synthesizing speech for text: "${text}" (${targetLanguageCode})`);

      const payload = {
        inputs: [text],
        target_language_code: targetLanguageCode,
        speaker: 'meera',
        pitch: 0,
        pace: 1.0,
        loudness: 1.5,
        speech_sample_rate: 8000,
        enable_preprocessing: true,
        model: 'bulbul:v1',
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'api-subscription-key': env.SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = (await response.json()) as { audios?: string[] };

      if (response.ok && responseData.audios && responseData.audios.length > 0) {
        const base64Audio = responseData.audios[0];
        const audioBuffer = Buffer.from(base64Audio, 'base64');
        logger.info(`[Sarvam TTS] Generated speech audio successfully (${audioBuffer.length} bytes)`);
        return audioBuffer;
      } else {
        logger.error('[Sarvam TTS] API returned error:', responseData);
        return null;
      }
    } catch (error) {
      logger.error('[Sarvam TTS] Exception during speech synthesis:', { error });
      return null;
    }
  }
}

export const sarvamTtsService = new SarvamTtsService();
