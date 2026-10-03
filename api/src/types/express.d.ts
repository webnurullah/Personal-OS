import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireUser. */
      user: { id: string; email: string };
      /** Supabase client acting as this user (Row Level Security applies). */
      db: SupabaseClient<Database>;
      /** Cached for the request by getProfile(). */
      profile?: Database['public']['Tables']['profiles']['Row'];
    }
  }
}

export {};
