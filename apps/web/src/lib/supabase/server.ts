/**
 * Supabase server client — uses service role key (G6: server-side only).
 * Never import this in client components or pages that ship to the browser.
 */
import { createClient } from '@supabase/supabase-js';

// Placeholder fallbacks keep module load (and the production build's page-data
// collection) from throwing when env vars are absent. Real values are injected
// at runtime; with the placeholder, any actual request fails loudly instead.
// `||` (not `??`) so an empty-string env var — e.g. an unset CI secret, which
// GitHub injects as '' rather than undefined — also falls back to the placeholder.
const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || 'http://localhost:54321';
const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || 'placeholder-service-role-key';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseAdmin = createClient<any>(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
