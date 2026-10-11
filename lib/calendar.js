// Pure helpers for the Google Calendar import: parsing an iCal feed into plain
// lesson occurrences, and matching event titles to members. No database access
// here, so it can be tested on its own.
import ical from "node-ical";
import { createHash } from "crypto";

const GYM_TZ = "Europe/Istanbul";

// Lower-case, strip Turkish diacritics and punctuation so "AYŞE Yılmaz" matches "ayse yilmaz".
export function norm(str) {
  return String(str || "")
    .replace(/İ/g, "i").replace(/I/g, "i")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Returns the members whose full name appears in the event title. If no full
// name matches, falls back to a first name that belongs to exactly one member.
export function matchCustomers(title, customers) {
  const t = ` ${norm(title)} `;
  if (t.trim() === "") return [];
  const prepared = customers.map((c) => ({ c, n: norm(c.name) })).filter((x) => x.n);
  const full = prepared.filter((x) => t.includes(` ${x.n} `));
  if (full.length > 0) {
    // If one matched name is contained in another matched name (e.g. "Ali Veli" vs
    // "Ali Veli Kaya"), keep only the longest.
    return full
      .filter((x) => !full.some((y) => y !== x && y.n.length > x.n.length && y.n.includes(x.n)))
      .map((x) => x.c);
  }
  const byFirst = {};
  prepared.forEach((x) => {
    const f = x.n.split(" ")[0];
    (byFirst[f] = byFirst[f] || []).push(x.c);
  });
  const words = new Set(t.trim().split(" "));
  const hits = [];
  Object.entries(byFirst).forEach(([f, list]) => {
    if (list.length === 1 && words.has(f) && f.length >= 3) hits.push(list[0]);
  });
  return hits;
}

const dateTimeParts = (d) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GYM_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
};

// Turns raw iCal text into [{ key, title, date, startTime, durationMin }] for events
// that start between `from` and `to`. Skips all-day, cancelled, and very short/long events.
export function parseLessons(icsText, { from, to, maxDurationMin = 240 }) {
  const events = ical.sync.parseICS(icsText);
  const out = [];
  for (const e of Object.values(events)) {
    if (e.type !== "VEVENT") continue;
    if (String(e.status || "").toUpperCase() === "CANCELLED") continue;
    let instances = [];
    try {
      instances = ical.expandRecurringEvent(e, { from, to });
    } catch {
      continue; // one broken event must not break the whole calendar
    }
    const recurring = !!e.rrule || instances.some((i) => i.isOverride);
    for (const i of instances) {
      if (i.isFullDay || !i.start || !i.end) continue;
      const durationMin = Math.round((i.end - i.start) / 60000);
      if (durationMin < 10 || durationMin > maxDurationMin) continue;
      const { date, time } = dateTimeParts(i.start);
      // Single events keep one stable key even if moved; repeating ones are keyed per occurrence.
      const raw = recurring ? `${e.uid}|${i.start.toISOString()}` : `${e.uid}`;
      out.push({
        key: createHash("sha1").update(raw).digest("hex").slice(0, 16),
        title: String(i.summary || "").trim() || "(başlıksız)",
        date, startTime: time, durationMin,
      });
    }
  }
  return out;
}
