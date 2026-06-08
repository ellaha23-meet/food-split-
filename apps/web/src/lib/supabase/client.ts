/**
 * Supabase browser client — uses NEXT_PUBLIC_ vars only (G6).
 * Server-side code must use supabase/server.ts with the service role key.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

// In production the env vars must be set; this is validated at runtime.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
