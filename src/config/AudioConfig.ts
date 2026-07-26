/**
 * PCM and OPUS Audio Specifications for WebRTC <-> Gemini Live API Bridge
 */
export interface AudioConfiguration {
  /** Input audio sample rate expected by Gemini Live API (16kHz linear 16-bit PCM LE mono) */
  inputSampleRate: number;
  /** Output audio sample rate provided by Gemini Live API (24kHz linear 16-bit PCM LE mono) */
  outputSampleRate: number;
  /** WebRTC audio clock rate for Opus codec */
  webrtcSampleRate: number;
  /** Channels count (Mono = 1) */
  channels: number;
  /** PCM bit depth */
  bitDepth: number;
  /** Milliseconds per frame for RTP chunking (20ms standard) */
  frameDurationMs: number;
  /** Frame size in samples for 16kHz mono (20ms * 16000 / 1000 = 320 samples = 640 bytes) */
  inputFrameSizeBytes: number;
  /** Frame size in samples for 24kHz mono (20ms * 24000 / 1000 = 480 samples = 960 bytes) */
  outputFrameSizeBytes: number;
  /** Minimum RMS volume energy to treat chunk as valid human speech (vs background noise) */
  speechNoiseThresholdRms: number;
  /** RMS volume energy threshold to detect loud speech interruption (Barge-in) */
  bargeInThresholdRms: number;
}

export const audioConfig: AudioConfiguration = {
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  webrtcSampleRate: 48000,
  channels: 1,
  bitDepth: 16,
  frameDurationMs: 20,
  inputFrameSizeBytes: 640,
  outputFrameSizeBytes: 960,
  speechNoiseThresholdRms: 400,
  bargeInThresholdRms: 3000,
};
