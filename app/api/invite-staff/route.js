import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

// POST { email, name, role: 'owner' | 'pt' }
export async function POST(request) {
  const supabase = createClient();

  // Confirm the caller is actually logged in and is an Admin before doing anything.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  }
  const { data: callerStaff } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!callerStaff || callerStaff.role !== "owner") {
    return NextResponse.json({ error: "Bu işlem için admin yetkisi gerekiyor." }, { status: 403 });
  }

  const { email, name, role } = await request.json();
  if (!email || !name) {
    return NextResponse.json({ error: "E-posta ve isim gerekli." }, { status: 400 });
  }

  const admin = createAdminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/login`;

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) {
    return NextResponse.json({ error: "Davet gönderilemedi: " + inviteError.message }, { status: 400 });
  }

  const staffId = `s_${invited.user.id.slice(0, 8)}`;
  const { error: staffError } = await admin.from("staff").insert({
    id: staffId,
    auth_user_id: invited.user.id,
    name,
    role: role === "owner" ? "owner" : "pt",
  });
  if (staffError) {
    return NextResponse.json({ error: "Antrenör kaydı oluşturulamadı: " + staffError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, staffId });
}
