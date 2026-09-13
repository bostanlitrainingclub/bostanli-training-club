import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

// POST { email, name, role: 'owner' | 'pt' }
export async function POST(request) {
  const supabase = createClient();

  // Confirm the caller is actually logged in.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  }

  // Look up their role using the admin client (bypasses Row Level Security).
  // We've already verified above that `user` is a genuine, authenticated
  // account via Supabase's own auth check — this lookup is just reading
  // their role, not a security boundary in itself, so bypassing RLS here
  // is safe and avoids relying on RLS policies behaving a particular way
  // for this one internal check.
  const admin = createAdminClient();
  const { data: callerStaff, error: callerError } = await admin
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (callerError) {
    return NextResponse.json({ error: "DB hatası (yetki kontrolü): " + callerError.message }, { status: 500 });
  }
  if (!callerStaff) {
    return NextResponse.json({ error: `Bu hesaba bağlı bir antrenör kaydı bulunamadı (auth_user_id: ${user.id}).` }, { status: 403 });
  }
  if (callerStaff.role !== "owner") {
    return NextResponse.json({ error: `Bu hesabın rolü '${callerStaff.role}', admin değil.` }, { status: 403 });
  }

  const { email, name, role, password } = await request.json();
  if (!email || !name) {
    return NextResponse.json({ error: "E-posta ve isim gerekli." }, { status: 400 });
  }
  if (password && password.length < 8) {
    return NextResponse.json({ error: "Şifre en az 8 karakter olmalı." }, { status: 400 });
  }

  let newUserId;
  if (password) {
    // Create the login directly, active immediately — no invite email, no waiting.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createError) {
      return NextResponse.json({ error: "Hesap oluşturulamadı: " + createError.message }, { status: 400 });
    }
    newUserId = created.user.id;
  } else {
    // Fall back to the email-invite flow.
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/login`;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError) {
      return NextResponse.json({ error: "Davet gönderilemedi: " + inviteError.message }, { status: 400 });
    }
    newUserId = invited.user.id;
  }

  const staffId = `s_${newUserId.slice(0, 8)}`;
  const { error: staffError } = await admin.from("staff").insert({
    id: staffId,
    auth_user_id: newUserId,
    name,
    role: role === "owner" ? "owner" : "pt",
  });
  if (staffError) {
    return NextResponse.json({ error: "Antrenör kaydı oluşturulamadı: " + staffError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, staffId, invited: !password });
}
