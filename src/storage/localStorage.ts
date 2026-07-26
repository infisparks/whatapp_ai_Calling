import fs from 'fs';
import path from 'path';
import { CallSession, ParsedCallInfo } from '../types/whatsapp.types';
import { logger } from '../utils/logger';

const dataDir = path.join(process.cwd(), 'data');
const callsFilePath = path.join(dataDir, 'calls.json');
const sessionsFilePath = path.join(dataDir, 'sessions.json');

/**
 * Local File Storage Service for VPS temporary storage (No external database required)
 */
export class LocalStorageService {
  constructor() {
    this.ensureDataDirectory();
  }

  private ensureDataDirectory(): void {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info(`[LocalStorage] Created data directory at: ${dataDir}`);
      }
      if (!fs.existsSync(callsFilePath)) {
        fs.writeFileSync(callsFilePath, JSON.stringify([], null, 2), 'utf-8');
      }
      if (!fs.existsSync(sessionsFilePath)) {
        fs.writeFileSync(sessionsFilePath, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (error) {
      logger.error('[LocalStorage] Failed to initialize data directory:', { error });
    }
  }

  /**
   * Save call log record to VPS local JSON file
   */
  public saveCallRecord(callInfo: ParsedCallInfo, status: string, sdpAnswer?: string): void {
    try {
      const records = this.readJsonFile<Record<string, unknown>>(callsFilePath);
      const record = {
        callId: callInfo.callId,
        callerPhoneNumber: callInfo.callerPhoneNumber,
        businessPhoneNumberId: callInfo.businessPhoneNumberId,
        eventType: callInfo.eventType,
        status,
        timestamp: callInfo.timestamp || new Date().toISOString(),
        sdpOffer: callInfo.sdpOffer,
        sdpAnswer,
        savedAt: new Date().toISOString(),
      };

      records.push(record);
      fs.writeFileSync(callsFilePath, JSON.stringify(records, null, 2), 'utf-8');
      logger.info(`[LocalStorage] Saved call record ${callInfo.callId} to local VPS file (${callsFilePath})`);
    } catch (error) {
      logger.error(`[LocalStorage] Failed to save call record ${callInfo.callId}:`, { error });
    }
  }

  /**
   * Persist active sessions map to VPS JSON file
   */
  public saveSessions(sessions: CallSession[]): void {
    try {
      fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2), 'utf-8');
      logger.debug(`[LocalStorage] Persisted ${sessions.length} session(s) to local VPS file`);
    } catch (error) {
      logger.error('[LocalStorage] Failed to persist sessions:', { error });
    }
  }

  /**
   * Read stored call logs from local VPS JSON file
   */
  public getCallRecords(): Record<string, unknown>[] {
    return this.readJsonFile<Record<string, unknown>>(callsFilePath);
  }

  private readJsonFile<T>(filePath: string): T[] {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as T[];
      }
    } catch (error) {
      logger.error(`[LocalStorage] Error reading JSON file ${filePath}:`, { error });
    }
    return [];
  }
}

export const localStorageService = new LocalStorageService();
