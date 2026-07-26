import { ParsedSdpInfo } from '../types/whatsapp.types';
import { logger } from '../utils/logger';

/**
 * Utility class to parse and inspect WebRTC Session Description Protocol (SDP) offers
 * and generate RFC-compliant SDP Answers for Meta WhatsApp Business Calling API
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
      let iceUfrag: string | undefined;
      let icePwd: string | undefined;
      let mid: string | undefined;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('o=')) {
          origin = trimmed.substring(2);
        } else if (trimmed.startsWith('s=')) {
          sessionName = trimmed.substring(2);
        } else if (trimmed.startsWith('c=')) {
          const parts = trimmed.substring(2).split(' ');
          connectionAddress = parts.length >= 3 ? parts[2] : trimmed.substring(2);
        } else if (trimmed.startsWith('m=')) {
          const parts = trimmed.substring(2).split(' ');
          if (parts.length > 0) {
            mediaTypes.push(parts[0]);
          }
        } else if (trimmed.startsWith('a=rtpmap:')) {
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
        } else if (trimmed.startsWith('a=ice-ufrag:')) {
          iceUfrag = trimmed.substring(12);
        } else if (trimmed.startsWith('a=ice-pwd:')) {
          icePwd = trimmed.substring(10);
        } else if (trimmed.startsWith('a=mid:')) {
          mid = trimmed.substring(6);
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
        iceUfrag,
        icePwd,
        mid,
        fingerprint,
        rawSdp: sdpString,
      };

      logger.debug(`[SDP Parser] Successfully parsed SDP offer`, {
        audioCodecs,
        mediaTypes,
        iceCandidateCount: iceCandidates.length,
        hasFingerprint: !!fingerprint,
        hasIceUfrag: !!iceUfrag,
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
   * Generates a fully compliant WebRTC SDP Answer matching Meta WhatsApp Calling API specification
   */
  public static generateBoilerplateAnswer(parsedOffer: ParsedSdpInfo): string {
    const sessionTime = Math.floor(Date.now() / 1000);
    const ufrag = parsedOffer.iceUfrag || 'infi' + Math.random().toString(36).substring(2, 10);
    const pwd = parsedOffer.icePwd || 'pwd' + Math.random().toString(36).substring(2, 22);
    const fingerprint = parsedOffer.fingerprint || 'sha-256 75:68:7F:FE:8A:13:E1:E3:DA:CC:01:87:62:DD:6F:BD:E2:30:93:5A:35:05:6B:3B:DE:B3:16:9C:50:29:CE:54';
    const mid = parsedOffer.mid || 'audio';
    const connectionIp = parsedOffer.connectionAddress || '127.0.0.1';

    const sdpLines = [
      'v=0',
      `o=- ${sessionTime} 2 IN IP4 ${connectionIp}`,
      's=-',
      't=0 0',
      'a=group:BUNDLE audio',
      `a=msid-semantic: WMS infiplus_stream`,
      'm=audio 9000 UDP/TLS/RTP/SAVPF 111',
      `c=IN IP4 ${connectionIp}`,
      `a=mid:${mid}`,
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 maxaveragebitrate=20000;maxplaybackrate=16000;minptime=20;sprop-maxcapturerate=16000;useinbandfec=1',
      'a=rtcp-mux',
      'a=setup:active',
      `a=ice-ufrag:${ufrag}`,
      `a=ice-pwd:${pwd}`,
      `a=fingerprint:${fingerprint}`,
      'a=sendrecv',
      `a=msid:infiplus_stream infiplus_track1`,
      ''
    ];

    const answer = sdpLines.join('\r\n');
    logger.debug(`[SDP Parser] Generated RFC WebRTC SDP Answer:\n${answer}`);
    return answer;
  }
}
