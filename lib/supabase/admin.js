import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The service role key bypasses Row Level Security entirely — that's necessary
// to create new staff logins, but it must NEVER be imported into any file that
// runs in the browser. Only import this inside app/api/**/route.js files.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
