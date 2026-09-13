import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import GymApp from "../components/GymApp";

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: myStaff } = await supabase
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
