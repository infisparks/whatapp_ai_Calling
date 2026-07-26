/**
 * Types and Interfaces for WhatsApp Business Calling API & Webhook Events
 */

export type CallEventType = 
  | 'offer'
  | 'incoming'
  | 'accepted'
  | 'rejected'
  | 'terminate'
  | 'connect'
  | 'media_update';

export type CallSessionStatus =
  | 'INITIATED'
  | 'INCOMING'
  | 'RINGING'
  | 'ACCEPTING'
  | 'CONNECTED'
  | 'TERMINATED'
  | 'FAILED';

export interface SdpPayload {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface WhatsAppCallHeader {
  call_id: string;
  from: string;
  to: string;
  timestamp: string;
  event: CallEventType;
}

export interface WhatsAppCallMedia {
  audio_codec?: string;
  encryption?: string;
  sdp?: string;
}

export interface WhatsAppCallChangeValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  calls?: Array<{
    id: string;
    from: string;
    to: string;
    event: CallEventType;
    timestamp: string;
    session?: {
      sdp?: string;
      type?: 'offer' | 'answer';
      sdp_type?: 'offer' | 'answer';
    };
    audio?: {
      codec?: string;
      mime_type?: string;
    };
  }>;
  messages?: Array<{
    id: string;
    from: string;
    timestamp: string;
    type: string;
    [key: string]: unknown;
  }>;
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
    [key: string]: unknown;
  }>;
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: WhatsAppCallChangeValue;
    field: string;
  }>;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

export interface ParsedCallInfo {
  callId: string;
  callerPhoneNumber: string;
  businessPhoneNumberId: string;
  eventType: CallEventType;
  timestamp: string;
  sdpOffer?: string;
  audioCodec?: string;
  rawCallObject: unknown;
}

export interface ParsedSdpInfo {
  type: string;
  version: number;
  origin: string;
  sessionName: string;
  connectionAddress?: string;
  mediaTypes: string[];
  audioCodecs: string[];
  iceCandidates: string[];
  fingerprint?: string;
  rawSdp: string;
}

export interface CallSession {
  callId: string;
  callerPhoneNumber: string;
  status: CallSessionStatus;
  createdAt: Date;
  updatedAt: Date;
  sdpOffer?: string;
  parsedSdp?: ParsedSdpInfo;
  sdpAnswer?: string;
  metadata?: Record<string, unknown>;
}

export interface CallAcceptanceResult {
  success: boolean;
  callId: string;
  status: CallSessionStatus;
  sdpAnswer?: string;
  message: string;
  error?: string;
}
