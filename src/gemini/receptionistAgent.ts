import { logger } from '../utils/logger';
import { geminiLiveService } from '../services/gemini-live/GeminiLiveService';
import { GeminiLiveSession } from '../services/gemini-live/GeminiLiveSession';
import { GeminiFunctionCall } from '../services/gemini-live/GeminiEventParser';
import { HospitalDatabaseService } from '../supabase/dbClient';

/**
 * Hospital AI Receptionist Agent powered by Gemini Live API & Supabase Database
 */
export class HospitalReceptionistAgent {
  private systemPrompt = `You are Ananya, a highly professional, polite, and empathetic Hospital AI Receptionist for Infiplus Multi-Specialty Hospital.

VOICE & BEHAVIOR RULES:
1. Always sound like a warm, respectful human receptionist.
2. NEVER repeat generic introductory greetings once the call has started.
3. Keep responses concise, clear, and focused (average 2-5 seconds, maximum 15 seconds).
4. NEVER invent fake doctor schedules or appointments. Use your provided tools to check doctor availability, book appointments, reschedule, or answer hospital queries via Supabase.
5. If the patient mentions severe symptoms (e.g. severe chest pain, shortness of breath, heavy bleeding, loss of consciousness, severe trauma), immediately call the 'detectEmergency' tool and instruct them to visit the Emergency Trauma Unit or call 108.
6. Support multi-lingual conversations seamlessly (English, Hindi, Hinglish).`;

  private hospitalTools = [
    {
      functionDeclarations: [
        {
          name: 'bookAppointment',
          description: 'Book an appointment with a hospital doctor or department in Supabase',
          parameters: {
            type: 'OBJECT',
            properties: {
              patientName: { type: 'STRING', description: 'Full name of the patient' },
              patientPhone: { type: 'STRING', description: 'Patient contact phone number' },
              doctorName: { type: 'STRING', description: 'Doctor or specialist name' },
              department: { type: 'STRING', description: 'Medical department (e.g. Cardiology, Pediatrics)' },
              appointmentDate: { type: 'STRING', description: 'Date of appointment (YYYY-MM-DD or Tomorrow)' },
              appointmentTime: { type: 'STRING', description: 'Time slot (e.g. 10:30 AM)' },
              notes: { type: 'STRING', description: 'Optional medical notes' },
            },
            required: ['patientName', 'patientPhone', 'doctorName', 'appointmentDate', 'appointmentTime'],
          },
        },
        {
          name: 'cancelAppointment',
          description: 'Cancel an existing hospital appointment in Supabase',
          parameters: {
            type: 'OBJECT',
            properties: {
              identifier: { type: 'STRING', description: 'Appointment ID or patient phone number' },
            },
            required: ['identifier'],
          },
        },
        {
          name: 'rescheduleAppointment',
          description: 'Reschedule an existing appointment to a new date and time',
          parameters: {
            type: 'OBJECT',
            properties: {
              identifier: { type: 'STRING', description: 'Appointment ID or patient phone number' },
              newDate: { type: 'STRING', description: 'New appointment date' },
              newTime: { type: 'STRING', description: 'New appointment time' },
            },
            required: ['identifier', 'newDate', 'newTime'],
          },
        },
        {
          name: 'getDoctorAvailability',
          description: 'Check doctor schedule, department availability, and OPD timings in Supabase',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'Doctor name or medical department to search' },
            },
          },
        },
        {
          name: 'getHospitalTimings',
          description: 'Get general hospital OPD timings, visiting hours, and 24/7 emergency info',
          parameters: {
            type: 'OBJECT',
            properties: {
              department: { type: 'STRING', description: 'Specific department (optional)' },
            },
          },
        },
        {
          name: 'detectEmergency',
          description: 'Trigger emergency protocol for severe critical medical symptoms',
          parameters: {
            type: 'OBJECT',
            properties: {
              symptom: { type: 'STRING', description: 'Description of critical symptom' },
            },
            required: ['symptom'],
          },
        },
        {
          name: 'talkToHuman',
          description: 'Transfer caller to live human receptionist or senior nursing desk',
          parameters: {
            type: 'OBJECT',
            properties: {
              reason: { type: 'STRING', description: 'Reason for human agent transfer' },
            },
          },
        },
        {
          name: 'getGeneralFAQ',
          description: 'Answer questions about hospital location, parking, insurance cashless claims, and billing',
          parameters: {
            type: 'OBJECT',
            properties: {
              topic: { type: 'STRING', description: 'Query topic like location, parking, insurance, billing' },
            },
          },
        },
      ],
    },
  ];

  /**
   * Initial greeting for hospital receptionist
   */
  public getInitialGreeting(): string {
    return 'Welcome to Infiplus Multi-Specialty Hospital. My name is Ananya. How may I assist you with doctor appointments or medical inquiries today?';
  }

  /**
   * Initialize Gemini Live real-time streaming session for Hospital Receptionist
   */
  public async initializeLiveSession(callId: string): Promise<GeminiLiveSession> {
    logger.info(`[HospitalReceptionistAgent] Initializing Gemini Live Session with Supabase Tools for call ${callId}`);

    const session = await geminiLiveService.createSession({
      callId,
      systemInstruction: this.systemPrompt,
      voiceName: 'Kore',
      tools: this.hospitalTools,
    });

    // Listen for Gemini Live Function Tool Calls
    session.on('toolCall', async (functionCalls: GeminiFunctionCall[]) => {
      await this.handleToolCalls(callId, session, functionCalls);
    });

    return session;
  }

  /**
   * Execute function tools requested by Gemini Live API and return response
   */
  private async handleToolCalls(callId: string, session: GeminiLiveSession, functionCalls: GeminiFunctionCall[]): Promise<void> {
    const responses: Array<{ id: string; name: string; response: Record<string, any> }> = [];

    for (const fc of functionCalls) {
      logger.info(`[HospitalReceptionistAgent] Executing tool: ${fc.name} for call ${callId}`, fc.args);
      let result: Record<string, any> = {};

      try {
        switch (fc.name) {
          case 'bookAppointment':
            result = await HospitalDatabaseService.bookAppointment({
              patientName: fc.args.patientName || 'Caller',
              patientPhone: fc.args.patientPhone || 'Calling-Number',
              doctorName: fc.args.doctorName || 'General Physician',
              department: fc.args.department || 'General Medicine',
              appointmentDate: fc.args.appointmentDate || 'Tomorrow',
              appointmentTime: fc.args.appointmentTime || '10:00 AM',
              notes: fc.args.notes,
            });
            break;

          case 'cancelAppointment':
            result = await HospitalDatabaseService.cancelAppointment(fc.args.identifier);
            break;

          case 'rescheduleAppointment':
            result = await HospitalDatabaseService.rescheduleAppointment(fc.args.identifier, fc.args.newDate, fc.args.newTime);
            break;

          case 'getDoctorAvailability':
            const doctors = await HospitalDatabaseService.getDoctorAvailability(fc.args.query);
            result = { doctorsCount: doctors.length, doctors };
            break;

          case 'getHospitalTimings':
            result = {
              opdHours: 'Monday to Saturday: 08:00 AM - 08:00 PM',
              emergency: '24 Hours Emergency & Trauma Care Active',
              visitingHours: '04:00 PM - 07:00 PM daily',
            };
            break;

          case 'detectEmergency':
            logger.warn(`[HospitalReceptionistAgent] 🚨 EMERGENCY DETECTED for call ${callId}: "${fc.args.symptom}"`);
            result = {
              isEmergency: true,
              instructions: 'Please visit the 24/7 Casualty & Emergency Ward immediately or dial 108. Transferring to emergency medical team...',
            };
            break;

          case 'talkToHuman':
            result = {
              transferStatus: 'INITIATED',
              message: 'Hold on while I connect your call to the senior human receptionist desk.',
            };
            break;

          case 'getGeneralFAQ':
            const topic = (fc.args.topic || '').toLowerCase();
            if (topic.includes('location') || topic.includes('address')) {
              result = { info: 'Infiplus Hospital is located at Plot 45, Tech Park Road, Sector 5.' };
            } else if (topic.includes('insurance') || topic.includes('cashless')) {
              result = { info: 'We accept cashless insurance for over 30 major providers including Star Health, HDFC Ergo, and ICICI Lombard.' };
            } else if (topic.includes('parking')) {
              result = { info: 'Free 24-hour basement parking is available for patients and visitors.' };
            } else {
              result = { info: 'Infiplus Multi-Specialty Hospital offers 24/7 emergency care, ICU, OPD, and pharmacy services.' };
            }
            break;

          default:
            result = { status: 'SUCCESS', message: 'Function executed' };
            break;
        }
      } catch (err) {
        logger.error(`[HospitalReceptionistAgent] Error executing function ${fc.name}:`, { err });
        result = { error: 'Failed to process request in database' };
      }

      responses.push({ id: fc.id, name: fc.name, response: result });
    }

    session.sendToolResponse(responses);
  }

  /**
   * Legacy text response generator for backwards compatibility
   */
  public async generateResponse(userInput: string): Promise<string> {
    logger.info(`[Hospital Receptionist] Processing text user query: "${userInput}"`);
    return 'Welcome to Infiplus Hospital Reception. How can I assist you with your appointment today?';
  }
}

export const hospitalReceptionistAgent = new HospitalReceptionistAgent();
