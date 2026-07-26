import { ParsedSdpInfo } from '../types/whatsapp.types';
import { logger } from '../utils/logger';

/**
 * Utility class to parse and inspect WebRTC Session Description Protocol (SDP) offers
 */
export class SdpParser {
  /**
   * Parse raw SDP string into structured ParsedSdpInfo object
   */
  public static parse(sdpString: string): ParsedSdpInfo {
    try {
      const lines = sdpString.split(/\r\n|\n/);
      const mediaTypes: string[] = [];
      const audioCodecs: string[] = [];
      const iceCandidates: string[] = [];
      let origin = '';
      let sessionName = '';
      let connectionAddress: string | undefined;
      let fingerprint: string | undefined;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('o=')) {
          origin = trimmed.substring(2);
        } else if (trimmed.startsWith('s=')) {
          sessionName = trimmed.substring(2);
        } else if (trimmed.startsWith('c=')) {
          connectionAddress = trimmed.substring(2);
        } else if (trimmed.startsWith('m=')) {
          const parts = trimmed.substring(2).split(' ');
          if (parts.length > 0) {
            mediaTypes.push(parts[0]); // e.g. "audio" or "video"
          }
        } else if (trimmed.startsWith('a=rtpmap:')) {
          // e.g. a=rtpmap:111 opus/48000/2
          const codecMatch = trimmed.match(/a=rtpmap:\d+\s+([^\/]+)/i);
          if (codecMatch && codecMatch[1]) {
            const codecName = codecMatch[1].toUpperCase();
            if (!audioCodecs.includes(codecName)) {
              audioCodecs.push(codecName);
            }
          }
        } else if (trimmed.startsWith('a=candidate:')) {
          iceCandidates.push(trimmed.substring(12));
        } else if (trimmed.startsWith('a=fingerprint:')) {
          fingerprint = trimmed.substring(14);
        }
      }

      const parsed: ParsedSdpInfo = {
        type: sdpString.includes('a=setup:actpass') || sdpString.includes('v=0') ? 'offer' : 'unknown',
        version: 0,
        origin,
        sessionName,
        connectionAddress,
        mediaTypes,
        audioCodecs,
        iceCandidates,
        fingerprint,
        rawSdp: sdpString,
      };

      logger.debug(`[SDP Parser] Successfully parsed SDP offer`, {
        audioCodecs,
        mediaTypes,
        iceCandidateCount: iceCandidates.length,
      });

      return parsed;
    } catch (error) {
      logger.error('[SDP Parser] Error parsing SDP string:', { error });
      return {
        type: 'offer',
        version: 0,
        origin: 'unknown',
        sessionName: '-',
        mediaTypes: ['audio'],
        audioCodecs: ['OPUS'],
        iceCandidates: [],
        rawSdp: sdpString,
      };
    }
  }

  /**
   * Generates a basic boilerplate WebRTC SDP Answer for call acceptance (Phase 1 skeleton)
   */
  public static generateBoilerplateAnswer(parsedOffer: ParsedSdpInfo): string {
    const sessionTime = Math.floor(Date.now() / 1000);
    const audioCodec = parsedOffer.audioCodecs.includes('OPUS') ? '111 opus/48000/2' : '0 PCMU/8000';

    return [
      'v=0',
      `o=- ${sessionTime} 2 IN IP4 127.0.0.1`,
      's=Infiplus AI WhatsApp Calling Agent',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      'm=audio 9000 RTP/SAVPF 111',
      `a=rtpmap:${audioCodec}`,
      'a=sendrecv',
      'a=setup:active',
      'a=connection:new',
      ''
    ].join('\r\n');
  }
}
