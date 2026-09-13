import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Uses the visiting user's own cookies/session — every query still goes
// through the Row Level Security rules defined in supabase-schema.sql.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component that can't set cookies — safe to ignore,
            // middleware.js is what actually refreshes the session.
          }
        },
      },
    }
  );
}
