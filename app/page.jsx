import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import { createAdminClient } from "../lib/supabase/admin";
import GymApp from "../components/GymApp";

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Uses the admin client (bypasses Row Level Security) for this one lookup —
  // `user` is already a verified, authenticated account at this point, so this
  // read isn't a security boundary, just reliably fetching their own role/name.
  const admin = createAdminClient();
  const { data: myStaff } = await admin
    .from("staff")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!myStaff) {
    // Logged in, but not linked to a staff record — shouldn't happen via the normal
    // invite flow, but fail safely with a clear message rather than a blank screen.
    return (
      <div style={{ padding: 40, fontFamily: "Inter, sans-serif" }}>
        <h2>Hesabınız bir antrenör kaydına bağlı değil</h2>
        <p>Lütfen yöneticinizden hesabınızı kontrol etmesini isteyin.</p>
      </div>
    );
  }

  return (
    <GymApp
      myStaffId={myStaff.id}
      myRole={myStaff.role === "owner" ? "owner" : "pt"}
      myName={myStaff.name}
    />
  );
}
