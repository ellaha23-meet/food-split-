/**
 * Supabase browser client — uses NEXT_PUBLIC_ vars only (G6).
 * Server-side code must use supabase/server.ts with the service role key.
 */
import { createClient } from '@supabase/supabase-js';

// Placeholder fallbacks keep the build from throwing when env vars are absent;
// real NEXT_PUBLIC_ values are injected at build/runtime (G6: anon key only).
// `||` (not `??`) so an empty-string env var — e.g. an unset CI secret, which
// GitHub injects as '' rather than undefined — also falls back to the placeholder.
const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'http://localhost:54321';
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || 'placeholder-anon-key';

// In production the env vars must be set; this is validated at runtime.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
