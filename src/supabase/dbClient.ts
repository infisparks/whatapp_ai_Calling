import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';
import { logger } from '../utils/logger';

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    if (!env.SUPABASE_URL || env.SUPABASE_URL.includes('dummy')) {
      logger.warn('[Supabase] Initializing with placeholder client (Credentials not yet configured)');
    }
    supabaseClient = createClient(
      env.SUPABASE_URL || 'https://dummy.supabase.co',
      env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'
    );
  }
  return supabaseClient;
};
