import { logger } from '../utils/logger';

/**
 * Gemini 2.5 Flash Hospital AI Receptionist Agent (Phase 2 Placeholder)
 * Business Logic: Book Appointment, Cancel/Reschedule, Doctor Availability, OPD Info, Hospital Timings, Emergency Detection.
 */
export class HospitalReceptionistAgent {
  public async generateResponse(userInput: string, _conversationHistory: Array<{ role: string; text: string }> = []): Promise<string> {
    logger.info(`[Hospital Receptionist] Processing user query: "${userInput}"`);
    return 'Welcome to Infiplus Hospital Reception. How can I assist you with your appointment today?';
  }
}

export const hospitalReceptionistAgent = new HospitalReceptionistAgent();
