import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { parseLessons, matchCustomers } from "../../../lib/calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_INTERVAL_MS = 2 * 60 * 1000; // don't re-fetch a calendar more often than this
const DAYS_BACK = 14;
const DAYS_FORWARD = 90;

const todayIstanbul = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const addDaysStr = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function normalizeUrl(raw) {
  let u = String(raw || "").trim().replace(/^webcal:\/\//i, "https://");
  try {
    const url = new URL(u);
    // Only Google Calendar feeds — stops this endpoint being used to fetch arbitrary addresses.
    if (url.protocol !== "https:" || url.hostname !== "calendar.google.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// POST { force?: boolean, staffId?: string }
// Any logged-in user may trigger a refresh (it is throttled); only an admin can force one.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("staff").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (!caller) return NextResponse.json({ error: "Hesap bir antrenöre bağlı değil." }, { status: 403 });

  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  const force = body.force === true && caller.role === "owner";

  let q = admin.from("staff_calendars").select("*");
  if (body.staffId) q = q.eq("staff_id", body.staffId);
  const { data: cals, error: calErr } = await q;
  if (calErr) return NextResponse.json({ error: calErr.message }, { status: 500 });
  if (!cals || cals.length === 0) return NextResponse.json({ synced: 0, results: [] });

  const { data: customers } = await admin.from("customers").select("id, name");
  const today = todayIstanbul();
  const results = [];

  for (const cal of cals) {
    const lastMs = cal.last_synced_at ? new Date(cal.last_synced_at).getTime() : 0;
    if (!force && Date.now() - lastMs < MIN_INTERVAL_MS) {
      results.push({ staffId: cal.staff_id, skipped: "recent" });
      continue;
    }
    const firstImport = !cal.last_synced_at;
    const windowStart = addDaysStr(today, -DAYS_BACK);
    const windowEnd = addDaysStr(today, DAYS_FORWARD);
    // The very first import only brings in today onwards, so old lessons don't
    // flood the "confirm attendance" list.
    const insertFrom = firstImport ? today : windowStart;

    try {
      const url = normalizeUrl(cal.ical_url);
      if (!url) throw new Error("Bağlantı geçerli bir Google Takvim (calendar.google.com) adresi değil.");
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Google Takvim yanıtı: ${res.status}. Gizli adres doğru mu?`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Bu adres bir takvim dosyası döndürmedi.");

      const lessons = parseLessons(text, {
        from: new Date(windowStart + "T00:00:00Z"),
        to: new Date(windowEnd + "T23:59:59Z"),
      }).filter((l) => l.date >= windowStart && l.date <= windowEnd);

      // Build the desired set of sessions.
      const skippedTitles = {};
      const wanted = new Map(); // id -> row fields
      for (const l of lessons) {
        const matched = matchCustomers(l.title, customers || []);
        if (cal.only_matched && matched.length === 0) {
          skippedTitles[l.title] = (skippedTitles[l.title] || 0) + 1;
          continue;
        }
        wanted.set(`gcal_${cal.staff_id}_${l.key}`, {
          date: l.date, start_time: l.startTime, duration_min: l.durationMin,
          customer_ids: matched.map((m) => m.id),
          customer_names: matched.length ? matched.map((m) => m.name).join(", ") : l.title,
        });
      }

      // What we already imported for this trainer.
      const { data: existing, error: exErr } = await admin
        .from("sessions").select("id, date, start_time, duration_min, customer_ids, attendance")
        .eq("pt_id", cal.staff_id).like("id", "gcal\\_%")
        .gte("date", windowStart).lte("date", windowEnd);
      if (exErr) throw new Error(exErr.message);
      const existingById = new Map((existing || []).map((r) => [r.id, r]));

      const toInsert = [];
      let updated = 0;
      for (const [id, w] of wanted) {
        const ex = existingById.get(id);
        if (!ex) {
          if (w.date < insertFrom) continue;
          toInsert.push({ id, type: "pt", pt_id: cal.staff_id, attendance: {}, reviewed: false, ...w });
        } else {
          const patch = {};
          if (ex.date !== w.date) patch.date = w.date;
          if (ex.start_time !== w.start_time) patch.start_time = w.start_time;
          if (ex.duration_min !== w.duration_min) patch.duration_min = w.duration_min;
          // Link the member later if one now matches — never overwrite a link that already exists.
          if ((ex.customer_ids || []).length === 0 && w.customer_ids.length > 0) {
            patch.customer_ids = w.customer_ids;
            patch.customer_names = w.customer_names;
          }
          if (Object.keys(patch).length > 0) {
            const { error } = await admin.from("sessions").update(patch).eq("id", id);
            if (error) throw new Error(error.message);
            updated++;
          }
        }
      }
      if (toInsert.length > 0) {
        const { error } = await admin.from("sessions").upsert(toInsert, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }

      // Lessons that disappeared from the calendar: remove them, unless attendance was already recorded.
      const toDelete = (existing || [])
        .filter((r) => !wanted.has(r.id) && Object.keys(r.attendance || {}).length === 0)
        .map((r) => r.id);
      if (toDelete.length > 0) {
        const { error } = await admin.from("sessions").delete().in("id", toDelete);
        if (error) throw new Error(error.message);
      }

      const skippedList = Object.entries(skippedTitles).sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([title, count]) => ({ title, count }));
      const report = { ok: true, total: wanted.size, added: toInsert.length, updated, removed: toDelete.length, skipped: skippedList };
      await admin.from("staff_calendars").update({ last_synced_at: new Date().toISOString(), last_report: report }).eq("staff_id", cal.staff_id);
      results.push({ staffId: cal.staff_id, ...report });
    } catch (err) {
      // On any failure leave existing sessions untouched — never delete anything because a fetch failed.
      const report = { ok: false, error: String(err.message || err) };
      await admin.from("staff_calendars").update({ last_synced_at: new Date().toISOString(), last_report: report }).eq("staff_id", cal.staff_id);
      results.push({ staffId: cal.staff_id, ...report });
    }
  }
  return NextResponse.json({ synced: results.length, results });
}
