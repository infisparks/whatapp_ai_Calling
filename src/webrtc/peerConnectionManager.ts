import { RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from 'werift';
import { logger } from '../utils/logger';
import { sarvamSttService } from '../sarvam/sttService';
import { infisparkAgent } from '../gemini/infisparkAgent';
import { sarvamTtsService } from '../sarvam/ttsService';

interface ActivePeerConnection {
  pc: RTCPeerConnection;
  sequenceNumber: number;
  timestamp: number;
  ssrc: number;
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
    };

    this.connections.set(callId, activeConn);

    // Listen to incoming audio track from WhatsApp caller
    pc.ontrack = (event) => {
      logger.info(`[PeerConnectionManager] Received incoming WebRTC audio track from call ${callId}`);
      
      const track = event.track;
      let incomingAudioChunks: Buffer[] = [];

      track.onReceiveRtp.subscribe((rtp: RtpPacket) => {
        if (rtp.payload && rtp.payload.length > 0) {
          incomingAudioChunks.push(Buffer.from(rtp.payload));
        }

        // Process audio chunk every ~3 seconds of caller speech
        if (incomingAudioChunks.length >= 150) {
          const fullAudioBuffer = Buffer.concat(incomingAudioChunks);
          incomingAudioChunks = [];

          this.processIncomingCallerAudio(callId, fullAudioBuffer).catch((err) => {
            logger.error(`[PeerConnectionManager] Error processing caller audio for ${callId}:`, { err });
          });
        }
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
   * Stream TTS audio buffer to caller over WebRTC PeerConnection
   */
  public async sendTtsAudioToCall(callId: string, pcmOrOpusBuffer: Buffer): Promise<boolean> {
    const conn = this.connections.get(callId);
    if (!conn) {
      logger.warn(`[PeerConnectionManager] Active connection not found for call ${callId}`);
      return false;
    }

    try {
      logger.info(`[PeerConnectionManager] Streaming ${pcmOrOpusBuffer.length} bytes of audio over WebRTC to call ${callId}`);
      
      const transceiver = conn.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio');
      if (!transceiver || !transceiver.sender) {
        logger.warn(`[PeerConnectionManager] Audio transceiver sender not available for call ${callId}`);
        return false;
      }

      // Chunk audio into 160-byte payload packets and transmit over RTP
      const chunkSize = 160;
      for (let offset = 0; offset < pcmOrOpusBuffer.length; offset += chunkSize) {
        const payload = pcmOrOpusBuffer.subarray(offset, offset + chunkSize);

        conn.sequenceNumber = (conn.sequenceNumber + 1) & 0xffff;
        conn.timestamp = (conn.timestamp + 960) & 0xffffffff;

        const header = new RtpHeader({
          version: 2,
          padding: false,
          extension: false,
          marker: offset === 0,
          payloadType: 111,
          sequenceNumber: conn.sequenceNumber,
          timestamp: conn.timestamp,
          ssrc: conn.ssrc,
          csrc: [],
        });

        const rtpPacket = new RtpPacket(header, payload);

        transceiver.sender.sendRtp(rtpPacket);
      }

      logger.info(`[PeerConnectionManager] ✅ Successfully transmitted RTP audio stream to call ${callId}`);
      return true;
    } catch (error) {
      logger.error(`[PeerConnectionManager] Exception streaming RTP audio to call ${callId}:`, { error });
      return false;
    }
  }

  /**
   * Process caller speech chunk -> Sarvam STT -> Gemini Agent -> Sarvam TTS -> Stream Audio
   */
  private async processIncomingCallerAudio(callId: string, audioBuffer: Buffer): Promise<void> {
    logger.info(`[PeerConnectionManager] Transcribing caller speech buffer (${audioBuffer.length} bytes)...`);

    // 1. Sarvam Speech-to-Text
    const transcript = await sarvamSttService.transcribeAudio(audioBuffer, 'en-IN');
    if (!transcript || transcript.trim().length === 0) {
      logger.debug('[PeerConnectionManager] No clear speech detected in audio chunk');
      return;
    }

    logger.info(`[PeerConnectionManager] Caller said: "${transcript}"`);

    // 2. Gemini Infispark AI Agent Response
    const aiResponseText = await infisparkAgent.processUserSpeech(callId, transcript);
    logger.info(`[PeerConnectionManager] Maya AI Response: "${aiResponseText}"`);

    // 3. Sarvam Text-to-Speech
    const replyAudioBuffer = await sarvamTtsService.synthesizeSpeech(aiResponseText, 'en-IN');
    if (replyAudioBuffer) {
      // 4. Stream back to caller
      await this.sendTtsAudioToCall(callId, replyAudioBuffer);
    }
  }

  /**
   * Close and cleanup WebRTC PeerConnection session
   */
  public closeConnection(callId: string): void {
    const conn = this.connections.get(callId);
    if (conn) {
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
