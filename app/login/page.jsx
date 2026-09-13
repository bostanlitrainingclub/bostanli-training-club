"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState("checking"); // 'checking' | 'signin' | 'setPassword'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // An invite/reset link logs the browser in automatically via the URL hash —
    // if that already happened, skip straight to "set your password" instead of
    // showing a normal sign-in form.
    const hash = window.location.hash || "";
    if (hash.includes("type=invite") || hash.includes("type=recovery")) {
      setMode("setPassword");
    } else {
      setMode("signin");
    }
  }, []);

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("E-posta veya şifre hatalı.");
      return;
    }
    window.location.href = "/";
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalı.");
      return;
    }
    if (password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("Bir sorun oluştu: " + error.message);
      return;
    }
    window.location.href = "/";
  }

  if (mode === "checking") return null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Bostanlı Training Club</h1>
        <p style={styles.subtitle}>
          {mode === "signin" ? "Salon panelinize giriş yapın" : "Hesabınız için bir şifre belirleyin"}
        </p>

        {mode === "signin" ? (
          <form onSubmit={handleSignIn} style={styles.form}>
            <label style={styles.label}>E-posta</label>
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <label style={styles.label}>Şifre</label>
            <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <div style={styles.error}>{error}</div>}
            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetPassword} style={styles.form}>
            <label style={styles.label}>Yeni şifre</label>
            <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            <label style={styles.label}>Yeni şifre (tekrar)</label>
            <input style={styles.input} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
            {error && <div style={styles.error}>{error}</div>}
            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? "Kaydediliyor…" : "Şifreyi kaydet ve giriş yap"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F5F1", fontFamily: "Inter, system-ui, sans-serif" },
  card: { width: 360, background: "#fff", borderRadius: 14, padding: "32px 28px", boxShadow: "0 10px 40px rgba(0,0,0,0.08)" },
  title: { fontFamily: "Oswald, sans-serif", fontSize: 22, margin: "0 0 4px 0", color: "#161616" },
  subtitle: { fontSize: 13.5, color: "#68766D", margin: "0 0 22px 0" },
  form: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12.5, fontWeight: 600, color: "#68766D", marginTop: 8 },
  input: { border: "1px solid #DEE3DA", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  button: { marginTop: 18, background: "#171717", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  error: { fontSize: 12.5, color: "#C1443C", marginTop: 4 },
};
