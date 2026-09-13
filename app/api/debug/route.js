import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/admin";

// Temporary diagnostic endpoint — visit it directly in the browser to see
// exactly what the live app's database connection returns. Delete this file
// once the underlying issue is found and fixed.
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("staff").select("*");

  return NextResponse.json({
    supabaseUrlConfigured: process.env.NEXT_PUBLIC_SUPABASE_URL || "(missing!)",
    anonKeyPresent: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKeyPresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceRoleKeyLength: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
    staffTableRowCount: data ? data.length : null,
    staffTableRows: data,
    queryError: error,
  });
}
