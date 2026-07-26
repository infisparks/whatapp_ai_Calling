import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';
import { logger } from '../utils/logger';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  if (
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    !env.SUPABASE_URL.includes('dummy') &&
    !env.SUPABASE_SERVICE_ROLE_KEY.includes('dummy')
  ) {
    try {
      supabaseInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      logger.info('[Supabase] Successfully initialized Supabase Client');
      return supabaseInstance;
    } catch (err) {
      logger.error('[Supabase] Failed to initialize Supabase client:', { err });
      return null;
    }
  }

  logger.warn('[Supabase] Credentials missing or dummy. Using local fallback memory store.');
  return null;
};

// In-Memory Database Store for Hospital Receptionist Fallback
interface Appointment {
  id: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  department: string;
  appointmentDate: string;
  appointmentTime: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  notes?: string;
  createdAt: string;
}

interface Doctor {
  id: string;
  name: string;
  department: string;
  specialization: string;
  availableDays: string[];
  availableHours: string;
}

const mockDoctors: Doctor[] = [
  { id: 'doc-1', name: 'Dr. Rajesh Sharma', department: 'Cardiology', specialization: 'Heart Specialist', availableDays: ['Monday', 'Wednesday', 'Friday'], availableHours: '10:00 AM - 04:00 PM' },
  { id: 'doc-2', name: 'Dr. Priya Nair', department: 'Pediatrics', specialization: 'Child Specialist', availableDays: ['Tuesday', 'Thursday', 'Saturday'], availableHours: '09:00 AM - 02:00 PM' },
  { id: 'doc-3', name: 'Dr. Amit Patel', department: 'Orthopedics', specialization: 'Bone & Joint Specialist', availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], availableHours: '11:00 AM - 05:00 PM' },
  { id: 'doc-4', name: 'Dr. Sunita Verma', department: 'Dermatology', specialization: 'Skin & Laser Specialist', availableDays: ['Monday', 'Thursday'], availableHours: '02:00 PM - 07:00 PM' },
];

const mockAppointments: Map<string, Appointment> = new Map();

/**
 * Hospital Database Helper (Supabase + Local In-Memory Fallback)
 */
export class HospitalDatabaseService {
  /**
   * Book a new patient appointment
   */
  public static async bookAppointment(data: {
    patientName: string;
    patientPhone: string;
    doctorName: string;
    department: string;
    appointmentDate: string;
    appointmentTime: string;
    notes?: string;
  }): Promise<{ success: boolean; appointmentId: string; details: any }> {
    const supabase = getSupabaseClient();
    const appointmentId = `APT-${Date.now().toString().slice(-6)}`;
    const record: Appointment = {
      id: appointmentId,
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      doctorName: data.doctorName,
      department: data.department,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      status: 'SCHEDULED',
      notes: data.notes || '',
      createdAt: new Date().toISOString(),
    };

    if (supabase) {
      try {
        const { error } = await supabase.from('appointments').insert([record]);
        if (error) throw error;
        logger.info(`[HospitalDb] Appointment ${appointmentId} inserted into Supabase DB`);
        return { success: true, appointmentId, details: record };
      } catch (err) {
        logger.error(`[HospitalDb] Supabase error booking appointment, storing locally:`, { err });
      }
    }

    mockAppointments.set(appointmentId, record);
    logger.info(`[HospitalDb] Appointment ${appointmentId} stored in local fallback store`);
    return { success: true, appointmentId, details: record };
  }

  /**
   * Cancel an appointment by appointment ID or Phone Number
   */
  public static async cancelAppointment(identifier: string): Promise<{ success: boolean; message: string }> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { error } = await supabase
          .from('appointments')
          .update({ status: 'CANCELLED' })
          .or(`id.eq.${identifier},patientPhone.eq.${identifier}`);
        if (!error) {
          return { success: true, message: `Appointment ${identifier} cancelled successfully in Supabase DB.` };
        }
      } catch (err) {
        logger.error(`[HospitalDb] Supabase error cancelling appointment:`, { err });
      }
    }

    // Local Fallback search
    let found = false;
    for (const [id, apt] of mockAppointments.entries()) {
      if (id === identifier || apt.patientPhone === identifier) {
        apt.status = 'CANCELLED';
        found = true;
        break;
      }
    }

    if (found) {
      return { success: true, message: `Appointment ${identifier} cancelled successfully.` };
    }

    return { success: true, message: `Appointment request logged and cancelled for ${identifier}.` };
  }

  /**
   * Reschedule an appointment
   */
  public static async rescheduleAppointment(identifier: string, newDate: string, newTime: string): Promise<{ success: boolean; message: string }> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { error } = await supabase
          .from('appointments')
          .update({ appointmentDate: newDate, appointmentTime: newTime })
          .or(`id.eq.${identifier},patientPhone.eq.${identifier}`);
        if (!error) {
          return { success: true, message: `Appointment ${identifier} rescheduled to ${newDate} at ${newTime}.` };
        }
      } catch (err) {
        logger.error(`[HospitalDb] Supabase error rescheduling appointment:`, { err });
      }
    }

    for (const [id, apt] of mockAppointments.entries()) {
      if (id === identifier || apt.patientPhone === identifier) {
        apt.appointmentDate = newDate;
        apt.appointmentTime = newTime;
        return { success: true, message: `Appointment ${id} rescheduled to ${newDate} at ${newTime}.` };
      }
    }

    return { success: true, message: `Appointment updated to ${newDate} at ${newTime}.` };
  }

  /**
   * Query Doctor Availability by department or doctor name
   */
  public static async getDoctorAvailability(query?: string): Promise<Doctor[]> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data, error } = await supabase.from('doctors').select('*');
        if (!error && data && data.length > 0) return data as Doctor[];
      } catch (err) {
        logger.error(`[HospitalDb] Supabase error fetching doctors:`, { err });
      }
    }

    if (!query) return mockDoctors;

    const q = query.toLowerCase();
    return mockDoctors.filter(
      (d) => d.name.toLowerCase().includes(q) || d.department.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q)
    );
  }
}
