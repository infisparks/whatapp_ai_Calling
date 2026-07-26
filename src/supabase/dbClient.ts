import { logger } from '../utils/logger';

/**
 * Supabase client placeholder (Disabled in favor of VPS Local Storage for now)
 */
export const getSupabaseClient = (): null => {
  logger.debug('[Supabase] External database disabled. Using VPS Local JSON Storage.');
  return null;
};
