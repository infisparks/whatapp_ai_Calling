import { RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from 'werift';
import { logger } from '../utils/logger';
import { sarvamSttService } from '../sarvam/sttService';
import { infisparkAgent } from '../gemini/infisparkAgent';
import { sarvamTtsService } from '../sarvam/ttsService';
import { AudioProcessor } from '../audio/audioProcessor';
import { geminiLiveService } from '../services/gemini-live/GeminiLiveService';

interface ActivePeerConnection {
  pc: RTCPeerConnection;
  sequenceNumber: number;
  timestamp: number;
  ssrc: number;
  speechTimeout: NodeJS.Timeout | null;
  isProcessingSpeech: boolean;
  cancelTtsStream: boolean;
  isStreamingTts: boolean;
  loudSpeechCountDuringTts: number;
}

/**
 * WebRTC PeerConnection Manager using werift engine for WhatsApp Business Calling API
 */
export class PeerConnectionManager {
  private connections: Map<string, ActivePeerConnection> = new Map();

  /**
   * Initialize a new WebRTC PeerConnection for an incoming call offer
   */
  public async handleCallOffer(callId: string, sdpOffer: string): Promise<string> {
    logger.info(`[PeerConnectionManager] Initializing WebRTC PeerConnection for call ${callId}`);

    const pc = new RTCPeerConnection({
      codecs: {
        audio: [
          new RTCRtpCodecParameters({
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
            payloadType: 111,
          }),
        ],
      },
    });

    const activeConn: ActivePeerConnection = {
      pc,
      sequenceNumber: 100,
      timestamp: 1000,
      ssrc: Math.floor(Math.random() * 0xffffffff),
      speechTimeout: null,
      isProcessingSpeech: false,
      cancelTtsStream: false,
      isStreamingTts: false,
      loudSpeechCountDuringTts: 0,
    };

    this.connections.set(callId, activeConn);

    // Listen to incoming audio track from WhatsApp caller
    pc.ontrack = (event) => {
      logger.info(`[PeerConnectionManager] Received incoming WebRTC audio track from call ${callId}`);

      const track = event.track;
      let incomingAudioChunks: Buffer[] = [];

      const dispatchSpeechProcessing = () => {
        if (incomingAudioChunks.length < 30 || activeConn.isProcessingSpeech) {
          return;
        }

        const fullAudioBuffer = Buffer.concat(incomingAudioChunks);
        incomingAudioChunks = [];
        activeConn.isProcessingSpeech = true;

        this.processIncomingCallerAudio(callId, fullAudioBuffer).finally(() => {
          activeConn.isProcessingSpeech = false;
        });
      };

      track.onReceiveRtp.subscribe((rtp: RtpPacket) => {
        if (rtp.payload && rtp.payload.length > 0) {
          const pcmChunk = AudioProcessor.decodeOpusPacketToPcm(Buffer.from(rtp.payload));
          if (pcmChunk && pcmChunk.length > 0) {
            // 1. Forward raw audio directly to Gemini Live Audio Bridge if active
            const bridge = geminiLiveService.getAudioBridge(callId);
            if (bridge) {
              bridge.processCallerAudioChunk(pcmChunk);
            }

            const volume = AudioProcessor.calculatePcmVolume(pcmChunk);

            // Ignore background silence/room noise
            if (volume > 500) {
              incomingAudioChunks.push(pcmChunk);
            }

            // Interrupt check for traditional TTS playback
            if (activeConn.isStreamingTts && volume > 3500) {
              activeConn.loudSpeechCountDuringTts++;
              if (activeConn.loudSpeechCountDuringTts >= 15) {
                activeConn.cancelTtsStream = true;
              }
            }
          }
        }

        // Fallback silence timer for batch processing
        if (activeConn.speechTimeout) {
          clearTimeout(activeConn.speechTimeout);
        }

        activeConn.speechTimeout = setTimeout(() => {
          const bridge = geminiLiveService.getAudioBridge(callId);
          if (!bridge) {
            dispatchSpeechProcessing();
          }
        }, 600);
      });
    };

    // Explicitly add audio transceiver with bidirectional sendrecv media direction
    pc.addTransceiver('audio', { direction: 'sendrecv' });

    // Set Remote Description (WhatsApp Call Offer SDP)
    await pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });

    // Force transceivers direction to sendrecv
    pc.getTransceivers().forEach((t) => {
      t.direction = 'sendrecv';
    });

    // Create Local Description (SDP Answer)
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    let finalSdp = pc.localDescription?.sdp || answer.sdp;
    finalSdp = finalSdp.replace(/a=recvonly/g, 'a=sendrecv');

    logger.info(`[PeerConnectionManager] WebRTC SDP Answer generated for call ${callId}`);
    return finalSdp;
  }

  /**
   * Stream array of encoded OPUS frames directly to call over WebRTC with real-time pacing & barge-in support
   */
  public async streamOpusFramesToCall(
    callId: string,
    opusFrames: Buffer[],
    isInterruptedFn?: () => boolean
  ): Promise<boolean> {
    const conn = this.connections.get(callId);
    if (!conn) return false;

    const transceiver = conn.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio');
    if (!transceiver || !transceiver.sender) return false;

    conn.isStreamingTts = true;

    try {
      for (let i = 0; i < opusFrames.length; i++) {
        if (conn.cancelTtsStream || (isInterruptedFn && isInterruptedFn())) {
          logger.info(`[PeerConnectionManager] [Call ${callId}] 🛑 Output audio streaming stopped due to interruption`);
          break;
        }

        const frame = opusFrames[i];
        conn.sequenceNumber = (conn.sequenceNumber + 1) & 0xffff;
        conn.timestamp = (conn.timestamp + 960) & 0xffffffff;

        const header = new RtpHeader({
          version: 2,
          padding: false,
          extension: false,
          marker: i === 0,
          payloadType: 111,
          sequenceNumber: conn.sequenceNumber,
          timestamp: conn.timestamp,
          ssrc: conn.ssrc,
          csrc: [],
        });

        const rtpPacket = new RtpPacket(header, frame);
        transceiver.sender.sendRtp(rtpPacket);

        // 20ms pacing delay per RTP audio frame
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return true;
    } catch (err) {
      logger.error(`[PeerConnectionManager] Exception streaming OPUS frames to call ${callId}:`, { err });
      return false;
    } finally {
      conn.isStreamingTts = false;
    }
  }

  /**
   * Immediately cancel any active audio playback for call (Barge-in)
   */
  public stopCallPlayback(callId: string): void {
    const conn = this.connections.get(callId);
    if (conn) {
      conn.cancelTtsStream = true;
      conn.isStreamingTts = false;
      logger.info(`[PeerConnectionManager] Cancelled active playback for call ${callId}`);
    }
  }

  /**
   * Stream TTS audio buffer to caller over WebRTC PeerConnection
   */
  public async sendTtsAudioToCall(callId: string, wavBuffer: Buffer): Promise<boolean> {
    const opusFrames = AudioProcessor.encodeWavToOpusFrames(wavBuffer);
    return this.streamOpusFramesToCall(callId, opusFrames);
  }

  /**
   * Process caller speech chunk fallback -> Sarvam STT -> Gemini Agent -> Sarvam TTS -> Stream Audio
   */
  private async processIncomingCallerAudio(callId: string, audioBuffer: Buffer): Promise<void> {
    logger.info(`[PeerConnectionManager] Transcribing caller speech buffer (${audioBuffer.length} bytes)...`);

    const transcript = await sarvamSttService.transcribeAudio(audioBuffer, 'en-IN');
    if (!transcript || transcript.trim().length === 0) {
      logger.debug('[PeerConnectionManager] No clear speech detected in audio chunk');
      return;
    }

    logger.info(`[PeerConnectionManager] Caller said: "${transcript}"`);
    const aiResponseText = await infisparkAgent.processUserSpeech(callId, transcript);
    logger.info(`[PeerConnectionManager] Maya AI Response: "${aiResponseText}"`);

    const replyAudioBuffer = await sarvamTtsService.synthesizeSpeech(aiResponseText, 'en-IN');
    if (replyAudioBuffer) {
      await this.sendTtsAudioToCall(callId, replyAudioBuffer);
    }
  }

  /**
   * Close and cleanup WebRTC PeerConnection session
   */
  public closeConnection(callId: string): void {
    const conn = this.connections.get(callId);
    if (conn) {
      if (conn.speechTimeout) {
        clearTimeout(conn.speechTimeout);
      }
      try {
        conn.pc.close();
      } catch (e) {
        logger.error(`Error closing connection for ${callId}:`, e);
      }
      this.connections.delete(callId);
      logger.info(`[PeerConnectionManager] Closed WebRTC PeerConnection for call ${callId}`);
    }
  }
}

export const peerConnectionManager = new PeerConnectionManager();
