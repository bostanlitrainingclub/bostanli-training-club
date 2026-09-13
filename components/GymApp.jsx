"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Users, Calendar, Wallet, LayoutDashboard, Plus, X, AlertTriangle,
  CheckCircle2, Clock, ChevronLeft, ChevronRight, Search, Trash2, Pencil, Dumbbell, TrendingUp, ListChecks,
  Download, Upload, LogOut, Mail
} from "lucide-react";
import { createClient as createSupabaseBrowserClient } from "../lib/supabase/client";
import {
  loadAll, syncTable, syncCommissionRates,
  customerToRow, staffToRow, sessionToRow, groupClassToRow,
} from "../lib/data";

/* ---------------------------------------------------------------
   CONSTANTS — the physical shape of the gym, encoded as data.
   Downstairs has 4 "floor units". A PT session or a private zone
   each occupy 1 unit. A group class occupies all 4 (exclusive).
   Only 2 physical private zones exist, so at most 2 can run at once.
   Upstairs (Pilates) is a separate, independent lane — always open.
------------------------------------------------------------------*/
const DOWNSTAIRS_UNITS = 4;
const PT_SLOTS = 4;
const MAX_PRIVATE_ZONES = 1;
const PRIVATE_ZONE_CAP = 3;
const GROUP_CLASS_CAP = 10;

const SESSION_TYPES = {
  pt:      { label: "PT Seansı",     units: 1, zone: "downstairs", color: "#1F6F54" },
  private: { label: "Private Zone",  units: 1, zone: "downstairs", color: "#3E6FA6" },
  group:   { label: "Grup Dersi",    units: 4, zone: "downstairs", color: "#C1443C" },
  pilates: { label: "Pilates",      units: 0, zone: "upstairs",   color: "#8B5FBF" },
};
// For a group session, the specific class name (e.g. "HIIT") is more useful than
// the generic "Grup Dersi" label everywhere a single session instance is shown.
const sessionLabel = (s) => (s.type === "group" && s.groupClassName ? s.groupClassName : SESSION_TYPES[s.type].label);

// Each trainer gets a consistent color across the floor plan, so their sessions are
// identifiable at a glance regardless of type. New trainers are assigned the next
// unused color; legacy records without a stored color fall back to a deterministic
// hash of their id, so the color never changes between renders.
const TRAINER_PALETTE = ["#1F6F54", "#3E6FA6", "#C1443C", "#8B5FBF", "#B8860B", "#2E8B87", "#A6486B", "#556B2F", "#4A6FA5", "#8B5A2B"];
function trainerColor(trainer) {
  if (!trainer) return "#6E6E68";
  if (trainer.color) return trainer.color;
  let hash = 0;
  for (let i = 0; i < trainer.id.length; i++) hash = (hash * 31 + trainer.id.charCodeAt(i)) >>> 0;
  return TRAINER_PALETTE[hash % TRAINER_PALETTE.length];
}

const HOURS = Array.from({ length: 16 }, (_, i) => 6 + i); // 06:00 - 21:00

const SEED_STAFF = [
  { id: "s1", name: "Emre" },
  { id: "s2", name: "Deniz" },
  { id: "s3", name: "Ece" },
  { id: "s4", name: "Burak" },
  { id: "s5", name: "Selin" },
];

const LOGO_WHITE = "data:image/png;base64,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";

const uid = () => Math.random().toString(36).slice(2, 10);
const toDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = () => toDateStr(new Date());
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};
const fmtDateHeading = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("tr-TR", {
    weekday: "long", month: "short", day: "numeric",
  });
const fmtShortDate = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("tr-TR", {
    day: "numeric", month: "short", year: "numeric",
  });
const timeToMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const minToTime = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const overlaps = (aStart, aDur, bStart, bDur) => {
  const aE = aStart + aDur, bE = bStart + bDur;
  return aStart < bE && bStart < aE;
};
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const ms = new Date(dateStr + "T00:00:00") - new Date(todayStr() + "T00:00:00");
  return Math.round(ms / 86400000);
};
const sessionEndMs = (s) => new Date(`${s.date}T${s.startTime}:00`).getTime() + s.durationMin * 60000;
const getWeekRange = (referenceDateStr) => {
  const d = new Date(referenceDateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
};
const isoWeekday = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00").getDay(); // 0=Sun..6=Sat
  return d === 0 ? 7 : d; // 1=Mon..7=Sun
};
const WEEKDAY_LABELS_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const WEEKDAY_SHORT_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// Trainer availability, per weekday: { on: bool, allDay: bool, start: "HH:00", end: "HH:00" }.
// Legacy records stored a plain array of weekday numbers (meaning "on, all day");
// this upgrades any shape into the new per-day object the first time it's read.
function normalizeAvailability(av) {
  const out = {};
  if (Array.isArray(av)) {
    ALL_WEEKDAYS.forEach((wd) => { out[wd] = { on: av.includes(wd), allDay: true, blocks: [] }; });
  } else if (av && typeof av === "object") {
    ALL_WEEKDAYS.forEach((wd) => {
      const d = av[wd];
      if (!d) { out[wd] = { on: false, allDay: true, blocks: [] }; return; }
      let blocks = Array.isArray(d.blocks) ? d.blocks.filter((b) => b && b.start && b.end) : [];
      if (blocks.length === 0 && d.start && d.end) blocks = [{ start: d.start, end: d.end }]; // migrate old single-range shape
      out[wd] = { on: !!d.on, allDay: d.allDay !== false, blocks };
    });
  } else {
    ALL_WEEKDAYS.forEach((wd) => { out[wd] = { on: true, allDay: true, blocks: [] }; });
  }
  return out;
}
function isTrainerAvailableAt(trainer, dateStr, startTime, durationMin) {
  const av = normalizeAvailability(trainer?.availability);
  const day = av[isoWeekday(dateStr)];
  if (!day || !day.on) return false;
  if (day.allDay) return true;
  const startMin = timeToMin(startTime);
  const endMin = startMin + Number(durationMin);
  return day.blocks.some((b) => startMin >= timeToMin(b.start) && endMin <= timeToMin(b.end));
}


/* ---------------------------------------------------------------
   TRAINER PAYOUTS — a trainer earns a manually-set % of what a
   member paid per session, for whichever sessions they actually
   delivered (marked "attended") in a given calendar month.
------------------------------------------------------------------*/
const DEFAULT_COMMISSION_PCT = 50;
const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (monthStr, delta) => {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
};
const commissionKey = (ptId, customerId, type) => `${ptId}::${customerId}::${type}`;
const getCommissionRate = (rates, ptId, customerId, type) => {
  const v = rates[commissionKey(ptId, customerId, type)];
  return v !== undefined ? v : DEFAULT_COMMISSION_PCT;
};

// For one trainer, in one calendar month: group every attended session by
// (member, session type), price it against that member's package rate, and
// apply the trainer's commission % for that member+type.
function computeTrainerEarnings(ptId, monthStr, sessions, customers, commissionRates) {
  const groups = {};
  sessions.forEach((s) => {
    if (s.ptId !== ptId || !s.date.startsWith(monthStr)) return;
    (s.customerIds || []).forEach((cid) => {
      if (s.attendance?.[cid] !== "attended") return;
      const customer = customers.find((c) => c.id === cid);
      if (!customer) return;
      const pkg = findPackageForType(customer, s.type);
      const key = cid + "::" + s.type;
      if (!groups[key]) groups[key] = { customer, type: s.type, pkg, count: 0 };
      groups[key].count += 1;
    });
  });
  const rows = Object.values(groups).map((g) => {
    const pricePerSession = g.pkg && g.pkg.price ? g.pkg.price / g.pkg.sessionCount : 0;
    const pct = getCommissionRate(commissionRates, ptId, g.customer.id, g.type);
    const payout = pricePerSession * g.count * (pct / 100);
    return { ...g, pricePerSession, pct, payout };
  });
  const total = rows.reduce((sum, r) => sum + r.payout, 0);
  return { rows, total };
}

// Members can hold a separate package per session type (PT / Private Zone /
// Group / Pilates), since each is priced and scheduled differently. Legacy
// records used a single flat package — this upgrades them the first time
// they're loaded, assuming it was a PT package.
function normalizeCustomer(c) {
  if (c.packages) return c;
  const packages = [];
  if (c.packageType) {
    packages.push({
      id: uid(),
      type: "pt",
      sessionCount: c.packageType,
      sessionsUsed: c.sessionsUsed || 0,
      purchaseDate: c.purchaseDate || null,
      expiryDate: c.expiryDate || null,
      price: null,
    });
  }
  return { ...c, packages };
}

function findPackageForType(customer, type) {
  return (customer.packages || []).find((p) => p.type === type) || null;
}

function deductPackageSession(customer, type) {
  let deducted = false;
  const packages = (customer.packages || []).map((p) => {
    if (!deducted && p.type === type && p.sessionsUsed < p.sessionCount) {
      deducted = true;
      return { ...p, sessionsUsed: p.sessionsUsed + 1 };
    }
    return p;
  });
  return { ...customer, packages };
}

// Undoes deductPackageSession — used when a session that was already marked
// "attended" gets deleted, so the member doesn't lose a session for nothing.
function refundPackageSession(customer, type) {
  let refunded = false;
  const packages = (customer.packages || []).map((p) => {
    if (!refunded && p.type === type && p.sessionsUsed > 0) {
      refunded = true;
      return { ...p, sessionsUsed: p.sessionsUsed - 1 };
    }
    return p;
  });
  return { ...customer, packages };
}

/* ---------------------------------------------------------------
   STORAGE — shared across everyone who opens this app, so PTs and
   the owner see the same live data.
------------------------------------------------------------------*/
/* ---------------------------------------------------------------
   ROOT APP
------------------------------------------------------------------*/
export default function GymApp({ myStaffId, myRole, myName }) {
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const role = myRole; // 'owner' | 'pt' — now comes from a real, verified login
  const currentPtId = myStaffId;
  const [tab, setTab] = useState("dashboard");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [commissionRates, setCommissionRates] = useState({});
  const [groupClasses, setGroupClasses] = useState([]);

  // Tracks the last state we actually wrote to the database, so the sync effects
  // below only send the rows that changed instead of re-writing everything.
  const prevRef = useRef({ customers: [], staff: [], sessions: [], groupClasses: [], commissionRates: {} });

  useEffect(() => {
    (async () => {
      try {
        const data = await loadAll(supabase);
        setCustomers(data.customers);
        setStaff(data.staff);
        setSessions(data.sessions);
        setCommissionRates(data.commissionRates);
        setGroupClasses(data.groupClasses);
        prevRef.current = data;
        setReady(true);
      } catch (err) {
        console.error("Failed to load data from Supabase:", err);
        // Deliberately do NOT set ready=true here — that would let the sync
        // effects below run against empty/placeholder state and start writing
        // it to the database, potentially overwriting real data with nothing.
        setLoadFailed(true);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    if (!ready) return;
    syncTable(supabase, "customers", prevRef.current.customers, customers, customerToRow);
    prevRef.current.customers = customers;
  }, [customers, ready, supabase]);
  useEffect(() => {
    if (!ready) return;
    syncTable(supabase, "staff", prevRef.current.staff, staff, (s) => staffToRow(s));
    prevRef.current.staff = staff;
  }, [staff, ready, supabase]);
  useEffect(() => {
    if (!ready) return;
    syncTable(supabase, "sessions", prevRef.current.sessions, sessions, sessionToRow);
    prevRef.current.sessions = sessions;
  }, [sessions, ready, supabase]);
  useEffect(() => {
    if (!ready) return;
    syncTable(supabase, "group_classes", prevRef.current.groupClasses, groupClasses, groupClassToRow);
    prevRef.current.groupClasses = groupClasses;
  }, [groupClasses, ready, supabase]);
  useEffect(() => {
    if (!ready) return;
    syncCommissionRates(supabase, prevRef.current.commissionRates, commissionRates);
    prevRef.current.commissionRates = commissionRates;
  }, [commissionRates, ready, supabase]);

  // All hooks are declared above this point — safe to return early from here on,
  // since no hook calls happen after this in the component.
  if (loadFailed) {
    return (
      <div style={{ padding: 40, fontFamily: "Inter, sans-serif" }}>
        <h2>Veriler yüklenemedi</h2>
        <p>Bir bağlantı sorunu oluştu. Lütfen sayfayı yenileyin. Sorun devam ederse yöneticinize bildirin.</p>
      </div>
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function exportBackup() {
    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      customers, staff, sessions, commissionRates, groupClasses,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bostanli-yedek-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        alert("Dosya okunamadı — geçerli bir yedek dosyası değil.");
        return;
      }
      if (!data || !Array.isArray(data.customers) || !Array.isArray(data.staff) || !Array.isArray(data.sessions)) {
        alert("Bu dosya geçerli bir Bostanlı yedeği gibi görünmüyor.");
        return;
      }
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString("tr-TR") : "bilinmeyen tarih";
      if (!confirm(`Bu yedek ${when} tarihinde alınmış. Şu anki tüm veriler bu yedekle değiştirilecek. Emin misiniz?`)) return;
      setCustomers((data.customers || []).map(normalizeCustomer));
      setStaff(data.staff || []);
      setSessions(data.sessions || []);
      setCommissionRates(data.commissionRates || {});
      setGroupClasses(data.groupClasses || []);
    };
    reader.readAsText(file);
  }

  function markAttendance(sessionId, customerId, status) {
    const session = sessions.find((s) => s.id === sessionId);
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const attendance = { ...(s.attendance || {}), [customerId]: status };
      const allDecided = (s.customerIds || []).every((id) => attendance[id]);
      return { ...s, attendance, reviewed: allDecided };
    }));
    if (status === "attended" && session) {
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? deductPackageSession(c, session.type) : c)));
    }
  }

  const tabs = [
    { id: "dashboard", label: "Panel", icon: LayoutDashboard },
    { id: "customers", label: "Üyeler", icon: Users },
    { id: "schedule", label: "Program", icon: Calendar },
    ...(role === "owner" ? [{ id: "staff", label: "Antrenörler", icon: Dumbbell }] : []),
    ...(role === "owner" ? [{ id: "groupClasses", label: "Grup Dersleri", icon: ListChecks }] : []),
    ...(role === "owner" ? [{ id: "payments", label: "Ödemeler", icon: Wallet }] : []),
    ...(role === "owner" ? [{ id: "reports", label: "Finansal Raporlar", icon: TrendingUp }] : []),
  ];

  if (!ready) {
    return (
      <div style={{ ...styles.app, alignItems: "center", justifyContent: "center", display: "flex" }}>
        <div style={{ color: styles.vars["--muted"], fontFamily: styles.vars["--font-body"] }}>
          Spor salonu verileri yükleniyor…
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <img src={LOGO_WHITE} alt="Bostanlı Training Club" style={styles.brandLogo} />
        </div>
        <nav style={styles.nav}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
              >
                <Icon size={17} strokeWidth={2} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div style={styles.roleSwitch}>
          <div style={styles.roleLabel}>Giriş yapan</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{myName}</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
            {role === "owner" ? "Admin" : "PT"}
          </div>
          <button
            onClick={signOut}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, borderRadius: 6, padding: "7px 8px", cursor: "pointer", width: "100%" }}
          >
            <LogOut size={13} /> Çıkış yap
          </button>
        </div>

        {role === "owner" && (
          <div style={styles.backupSection}>
            <div style={styles.roleLabel}>Veri Yedekleme</div>
            <button style={styles.backupBtn} onClick={exportBackup}>
              <Download size={14} /> Yedek indir
            </button>
            <label style={styles.backupBtn}>
              <Upload size={14} /> Yedekten geri yükle
              <input
                type="file" accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
      </aside>

      <main style={styles.main}>
        {tab === "dashboard" && (
          <Dashboard
            customers={customers} sessions={sessions} staff={staff} role={role}
            onMarkAttendance={markAttendance} setCustomers={setCustomers} currentPtId={currentPtId}
          />
        )}
        {tab === "customers" && (
          <CustomersTab customers={customers} setCustomers={setCustomers} sessions={sessions} staff={staff} role={role} />
        )}
        {tab === "schedule" && (
          <ScheduleTab
            sessions={sessions} setSessions={setSessions}
            staff={staff} customers={customers}
            onMarkAttendance={markAttendance}
            setCustomers={setCustomers}
            commissionRates={commissionRates} setCommissionRates={setCommissionRates}
            role={role} currentPtId={currentPtId}
            groupClasses={groupClasses}
          />
        )}
        {tab === "staff" && role === "owner" && (
          <StaffTab
            staff={staff} setStaff={setStaff} sessions={sessions} customers={customers}
            commissionRates={commissionRates} setCommissionRates={setCommissionRates}
          />
        )}
        {tab === "groupClasses" && role === "owner" && (
          <GroupClassesTab groupClasses={groupClasses} setGroupClasses={setGroupClasses} sessions={sessions} />
        )}
        {tab === "payments" && role === "owner" && (
          <PaymentsTab customers={customers} setCustomers={setCustomers} sessions={sessions} staff={staff} />
        )}
        {tab === "reports" && role === "owner" && (
          <FinancialReportsTab customers={customers} sessions={sessions} staff={staff} commissionRates={commissionRates} />
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------*/
function Dashboard({ customers, sessions, staff, role, onMarkAttendance, setCustomers, currentPtId }) {
  const today = todayStr();
  const todays = sessions.filter((s) => s.date === today).sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
  const [showPackageList, setShowPackageList] = useState(false);
  const [viewingCustomerId, setViewingCustomerId] = useState(null);

  // A package needs attention if it's expiring within 7 days OR has fewer than 2 sessions left.
  // Both conditions can apply to the same package — count it once, but note every reason that fired.
  const packageWarnings = [];
  customers.forEach((c) => {
    (c.packages || []).forEach((p) => {
      const expDays = daysUntil(p.expiryDate);
      const expiringSoon = expDays !== null && expDays >= 0 && expDays <= 7;
      const remaining = p.sessionCount - p.sessionsUsed;
      const lowSessions = remaining <= 2 && remaining >= 0;
      if (expiringSoon || lowSessions) {
        packageWarnings.push({ customer: c, pkg: p, expDays, expiringSoon, remaining, lowSessions });
      }
    });
  });
  const overdue = customers.filter((c) => c.balance > 0);
  const viewingCustomer = customers.find((c) => c.id === viewingCustomerId) || null;

  function warningReasonText(w) {
    const parts = [];
    if (w.expiringSoon) parts.push(`Bitiş ${w.expDays === 0 ? "bugün" : `${w.expDays} gün içinde`}`);
    if (w.lowSessions) parts.push(`${w.pkg.sessionsUsed}/${w.pkg.sessionCount} seans kullanıldı`);
    return parts.join(" · ");
  }
  function upsertCustomer(updated) {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setViewingCustomerId(null);
  }

  const now = Date.now();
  const pendingAttendance = sessions
    .filter((s) => (s.customerIds || []).length > 0 && !s.reviewed && sessionEndMs(s) <= now)
    .filter((s) => role === "owner" || s.ptId === currentPtId)
    .sort((a, b) => sessionEndMs(b) - sessionEndMs(a));

  return (
    <div>
      <PageHeader eyebrow={fmtDateHeading(today)} title="Bugün Salonda" />

      {pendingAttendance.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Card title="Katılımı Onayla">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {pendingAttendance.map((s) => (
                <div key={s.id} style={styles.attendanceGroup}>
                  <div style={styles.attendanceGroupHeader}>
                    <div style={{ ...styles.typeDot, background: SESSION_TYPES[s.type].color }} />
                    <span style={{ fontWeight: 600 }}>{sessionLabel(s)}</span>
                    <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
                      {s.date === today ? s.startTime : `${s.date} · ${s.startTime}`}
                    </span>
                  </div>
                  {(s.customerIds || []).map((cid) => {
                    const cust = customers.find((c) => c.id === cid);
                    if (!cust) return null;
                    const pkg = findPackageForType(cust, s.type);
                    const decided = s.attendance?.[cid];
                    return (
                      <div key={cid} style={styles.attendancePersonRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5 }}>{cust.name}</div>
                          {pkg && (
                            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                              {pkg.sessionsUsed}/{pkg.sessionCount} seans kullanıldı
                            </div>
                          )}
                        </div>
                        {decided ? (
                          <Pill tone={decided === "attended" ? "ok" : "neutral"}>
                            {decided === "attended" ? "Katıldı" : "Gelmedi"}
                          </Pill>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button style={styles.secondaryBtnSm} onClick={() => onMarkAttendance(s.id, cid, "no-show")}>Gelmedi</button>
                            <button style={styles.primaryBtnSm} onClick={() => onMarkAttendance(s.id, cid, "attended")}>
                              <CheckCircle2 size={13} /> Katıldı
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div style={styles.grid3}>
        <StatCard label="Toplam üye" value={customers.length} icon={Users} />
        <StatCard label="Bugünkü seanslar" value={todays.length} icon={Calendar} />
        {role === "owner" && (
          <StatCard
            label="7 gün içinde bitecek paket"
            value={packageWarnings.length}
            icon={AlertTriangle}
            tone="warn"
            active={showPackageList}
            onClick={() => setShowPackageList((v) => !v)}
          />
        )}
      </div>

      {role === "owner" && showPackageList && (
        <div style={{ marginBottom: 20 }}>
          <Card title="Dikkat gereken paketler">
            {packageWarnings.length === 0 && <EmptyState text="Şu anda dikkat gereken paket yok." />}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {packageWarnings.map((w) => (
                <div key={w.customer.id + w.pkg.id} style={styles.attendancePersonRow}>
                  <div style={{ flex: 1 }}>
                    <button
                      onClick={() => setViewingCustomerId(w.customer.id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                        {w.customer.name}
                      </div>
                    </button>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                      {SESSION_TYPES[w.pkg.type].label} · {warningReasonText(w)}
                    </div>
                  </div>
                  <Pill tone="warn">{w.pkg.sessionsUsed}/{w.pkg.sessionCount}</Pill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div style={styles.twoCol}>
        <Card title="Günün akışı">
          {todays.length === 0 && <EmptyState text="Bugün salonda hiçbir şey yok." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todays.map((s) => (
              <div key={s.id} style={styles.timelineRow}>
                <div style={{ ...styles.typeDot, background: SESSION_TYPES[s.type].color }} />
                <div style={{ width: 62, color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                  {s.startTime}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{sessionLabel(s)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {SESSION_TYPES[s.type].zone === "upstairs" ? "Üst Kat" : "Alt Kat"}
                    {s.ptId ? ` · ${staff.find((p) => p.id === s.ptId)?.name || "—"}` : ""}
                    {s.customerNames ? ` · ${s.customerNames}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{s.durationMin} dk</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Dikkat gerekiyor">
          {packageWarnings.length === 0 && (role !== "owner" || overdue.length === 0) && (
            <EmptyState text="Her şey yolunda — acil bir durum yok." />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {packageWarnings.map((w) => (
              <AlertRow key={w.customer.id + w.pkg.id} tone={w.expiringSoon ? "warn" : "info"}
                text={`${w.customer.name} — ${SESSION_TYPES[w.pkg.type].label}: ${warningReasonText(w)}`} />
            ))}
            {role === "owner" && overdue.map((c) => (
              <AlertRow key={"owe" + c.id} tone="danger"
                text={`${c.name} ${c.balance.toFixed(2)} TL borçlu`} />
            ))}
          </div>
        </Card>
      </div>

      {viewingCustomer && (
        <CustomerModal
          initial={viewingCustomer}
          onClose={() => setViewingCustomerId(null)}
          onSave={upsertCustomer}
          sessions={sessions}
          staff={staff}
        />
      )}
    </div>
  );
}

function AlertRow({ text, tone }) {
  const colors = { warn: "#E2A33D", danger: "#C1443C", info: "#3E6FA6" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: 99, background: colors[tone], flexShrink: 0 }} />
      <div style={{ fontSize: 13.5 }}>{text}</div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, onClick, active }) {
  const toneColor = tone === "warn" ? "#E2A33D" : tone === "danger" ? "#C1443C" : tone === "ok" ? "#1F6F54" : "var(--ink)";
  return (
    <div
      style={{ ...styles.statCard, cursor: onClick ? "pointer" : "default", borderColor: active ? "var(--ink)" : "var(--border)" }}
      onClick={onClick}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
        <Icon size={16} color="var(--muted)" />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: toneColor, marginTop: 6 }}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CUSTOMERS
------------------------------------------------------------------*/
function CustomersTab({ customers, setCustomers, sessions, staff, role }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // customer obj or 'new' or null
  const isOwner = role === "owner";

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    (c.phone || "").includes(query)
  );

  function upsert(customer) {
    setCustomers((prev) => {
      const exists = prev.some((c) => c.id === customer.id);
      return exists ? prev.map((c) => (c.id === customer.id ? customer : c)) : [...prev, customer];
    });
    setEditing(null);
  }
  function remove(id) {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <PageHeader eyebrow={`${customers.length} kayıtlı üye`} title="Üyeler" action={
        isOwner && (
          <button style={styles.primaryBtn} onClick={() => setEditing("new")}>
            <Plus size={15} /> Üye ekle
          </button>
        )
      } />

      <div style={styles.searchBar}>
        <Search size={15} color="var(--muted)" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="İsim veya telefon ile ara…" style={styles.searchInput}
        />
      </div>

      {filtered.length === 0 && <EmptyState text="Eşleşen üye yok." />}

      <div style={styles.customerList}>
        {filtered.map((c) => {
          const packages = c.packages || [];
          return (
            <div key={c.id} style={styles.customerCard}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <button
                    onClick={() => setEditing(c)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink)", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                      {c.name}
                    </div>
                  </button>
                  {isOwner && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{c.phone}{c.email ? ` · ${c.email}` : ""}</div>}
                </div>
                {isOwner && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={styles.iconBtn} onClick={() => setEditing(c)}><Pencil size={14} /></button>
                    <button style={styles.iconBtn} onClick={() => { if (confirm(`${c.name} adlı üyeyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) remove(c.id); }}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              {isOwner && (
                <div style={styles.customerMetaRow}>
                  {!c.membershipFormDone && (
                    <Pill tone="warn">Üyelik formu eksik</Pill>
                  )}
                  {packages.length > 0 ? (
                    packages.map((p) => {
                      const remaining = p.sessionCount - p.sessionsUsed;
                      const expDays = daysUntil(p.expiryDate);
                      const warn = remaining <= 2 || (expDays !== null && expDays <= 7);
                      return (
                        <Pill key={p.id} tone={!p.paid ? "danger" : warn ? "warn" : "neutral"}>
                          {SESSION_TYPES[p.type].label}: {p.sessionsUsed}/{p.sessionCount}
                          {p.expiryDate ? ` · Bitiş: ${p.expiryDate}` : ""}
                          {p.price ? ` · ${p.price} TL` : ""}
                          {!p.paid ? " · Ödenmedi" : ""}
                        </Pill>
                      );
                    })
                  ) : (
                    <Pill tone="neutral">Aktif paket yok</Pill>
                  )}
                  {c.balance > 0 && (
                    <Pill tone="danger">{c.balance.toFixed(2)} TL borçlu</Pill>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        isOwner ? (
          <CustomerModal
            initial={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSave={upsert}
            sessions={sessions}
            staff={staff}
          />
        ) : (
          <MemberSummaryModal
            customer={editing}
            sessions={sessions}
            staff={staff}
            onClose={() => setEditing(null)}
          />
        )
      )}
    </div>
  );
}

function CustomerModal({ initial, onClose, onSave, sessions, staff }) {
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [tcNo, setTcNo] = useState(initial?.tcNo || "");
  const [tcError, setTcError] = useState("");
  const [membershipFormDone, setMembershipFormDone] = useState(!!initial?.membershipFormDone);
  const [balance, setBalance] = useState(initial?.balance ?? 0);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [packages, setPackages] = useState(initial?.packages ? initial.packages.map((p) => ({ ...p })) : []);

  function handleTcChange(value) {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 11);
    setTcNo(digitsOnly);
    setTcError(digitsOnly.length === 0 || digitsOnly.length === 11 ? "" : "TC kimlik numarası 11 haneli olmalı.");
  }

  function addPackage() {
    const purchaseDate = todayStr();
    setPackages((prev) => [{
      id: uid(),
      type: "pt",
      sessionCount: 8,
      sessionsUsed: 0,
      purchaseDate,
      expiryDate: addDays(purchaseDate, 28), // 8 sessions ≈ 2x/week, 12 ≈ 3x/week — either way, 4 weeks
      price: "",
      paid: false,
    }, ...prev]);
  }
  function updatePackage(id, field, value) {
    setPackages((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      // Re-anchor the 4-week expiry whenever the purchase date changes.
      if (field === "purchaseDate" && value) {
        updated.expiryDate = addDays(value, 28);
      }
      return updated;
    }));
  }
  function removePackage(id) {
    setPackages((prev) => prev.filter((p) => p.id !== id));
  }
  function togglePaid(id) {
    setPackages((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const paid = !p.paid;
      return { ...p, paid, paidDate: paid ? (p.paidDate || todayStr()) : null };
    }));
  }

  // Upcoming sessions first (soonest next, furthest last), then past sessions
  // below that (most recent first) — so what's coming up is always at the top.
  const memberSessions = initial
    ? (() => {
        const now = Date.now();
        const startMs = (s) => new Date(`${s.date}T${s.startTime}:00`).getTime();
        const all = (sessions || []).filter((s) => (s.customerIds || []).includes(initial.id));
        const upcoming = all.filter((s) => startMs(s) >= now).sort((a, b) => startMs(a) - startMs(b));
        const past = all.filter((s) => startMs(s) < now).sort((a, b) => startMs(b) - startMs(a));
        return [...upcoming, ...past];
      })()
    : [];

  function handleSave() {
    if (!name.trim()) return;
    if (tcNo.length !== 0 && tcNo.length !== 11) {
      setTcError("TC kimlik numarası 11 haneli olmalı.");
      return;
    }
    onSave({
      id: initial?.id || uid(),
      name: name.trim(),
      phone, email,
      tcNo: tcNo || null,
      membershipFormDone,
      balance: Number(balance) || 0,
      notes: notes.trim() || "",
      packages: packages.map((p) => ({
        ...p,
        sessionCount: Number(p.sessionCount) || 8,
        sessionsUsed: Number(p.sessionsUsed) || 0,
        price: p.price === "" ? null : Number(p.price),
        paid: !!p.paid,
      })),
    });
  }

  return (
    <Modal title={initial ? "Üyeyi düzenle" : "Yeni üye"} onClose={onClose}>
      <Field label="Ad Soyad"><input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={styles.fieldRow}>
        <Field label="Telefon"><input style={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="E-posta"><input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div>
      <Field label="TC Kimlik No (isteğe bağlı)">
        <input
          style={{ ...styles.input, borderColor: tcError ? "#C1443C" : "var(--border)" }}
          value={tcNo}
          onChange={(e) => handleTcChange(e.target.value)}
          inputMode="numeric"
          placeholder="11 haneli TC kimlik no"
        />
        {tcError && <div style={{ fontSize: 12, color: "#C1443C", marginTop: 5 }}>{tcError}</div>}
      </Field>

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16 }}>
        <input type="checkbox" checked={membershipFormDone} onChange={(e) => setMembershipFormDone(e.target.checked)} />
        <span style={{ fontSize: 13.5 }}>Üyelik formu dolduruldu</span>
      </label>

      <Field label="Notlar">
        <textarea
          style={{ ...styles.input, minHeight: 70, resize: "vertical", fontFamily: "var(--font-body)" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Örn. bel/diz sakatlığı, alerji, özel durumlar…"
        />
      </Field>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 8 }}>
        <div style={styles.fieldLabel}>Paketler</div>
        <button style={styles.secondaryBtnSm} onClick={addPackage}><Plus size={13} /> Paket ekle</button>
      </div>

      {packages.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>Henüz paket eklenmedi.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {packages.map((p) => {
          const remaining = Number(p.sessionCount) - Number(p.sessionsUsed);
          const expDays = daysUntil(p.expiryDate);
          const isExpired = remaining <= 0 || (expDays !== null && expDays < 0);
          const rowStyle = isExpired
            ? styles.packageRow
            : { ...styles.packageRow, background: "#E1F0EA", borderColor: "#1F6F54" };
          return (
          <div key={p.id} style={rowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <select
                style={{ ...styles.input, width: 160 }}
                value={p.type}
                onChange={(e) => updatePackage(p.id, "type", e.target.value)}
              >
                {Object.entries(SESSION_TYPES).map(([key, v]) => (
                  <option key={key} value={key}>{v.label}</option>
                ))}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pill tone={isExpired ? "neutral" : "ok"}>{isExpired ? "Sona erdi" : "Aktif"}</Pill>
                <button style={styles.iconBtn} onClick={() => removePackage(p.id)}><Trash2 size={14} /></button>
              </div>
            </div>
            <div style={styles.fieldRow}>
              <Field label="Seans sayısı">
                <select style={styles.input} value={p.sessionCount} onChange={(e) => updatePackage(p.id, "sessionCount", Number(e.target.value))}>
                  <option value={8}>8 seanslık paket</option>
                  <option value={12}>12 seanslık paket</option>
                </select>
              </Field>
              <Field label="Kullanılan seans">
                <input type="number" min="0" style={styles.input} value={p.sessionsUsed} onChange={(e) => updatePackage(p.id, "sessionsUsed", e.target.value)} />
              </Field>
            </div>
            <div style={styles.fieldRow}>
              <Field label="Satın alma tarihi">
                <input type="date" style={styles.input} value={p.purchaseDate || ""} onChange={(e) => updatePackage(p.id, "purchaseDate", e.target.value)} />
              </Field>
              <Field label="Bitiş tarihi">
                <input type="date" style={styles.input} value={p.expiryDate || ""} onChange={(e) => updatePackage(p.id, "expiryDate", e.target.value)} />
              </Field>
            </div>
            <Field label="Ücret (TL)">
              <input type="number" step="0.01" style={styles.input} value={p.price} onChange={(e) => updatePackage(p.id, "price", e.target.value)} placeholder="Bu üye için bu paketin ücreti" />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 4 }}>
              <input type="checkbox" checked={!!p.paid} onChange={() => togglePaid(p.id)} />
              <span style={{ fontSize: 13 }}>
                Bu paket ödendi{p.paid && p.paidDate ? ` — ${p.paidDate}` : ""}
              </span>
            </label>
          </div>
          );
        })}
      </div>

      <div style={styles.fieldLabel}>Seanslar</div>
      {!initial ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 16 }}>
          Üye kaydedildikten sonra seans geçmişi burada görünecek.
        </div>
      ) : memberSessions.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 16 }}>Henüz seans kaydı yok.</div>
      ) : (
        <div style={styles.sessionHistoryList}>
          {memberSessions.map((s) => (
            <MemberSessionRow key={s.id} s={s} staff={staff} customerId={initial.id} />
          ))}
        </div>
      )}

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>İptal</button>
        <button
          style={{ ...styles.primaryBtn, opacity: tcError ? 0.5 : 1, cursor: tcError ? "not-allowed" : "pointer" }}
          onClick={handleSave}
          disabled={!!tcError}
        >
          Üyeyi kaydet
        </button>
      </div>
    </Modal>
  );
}

// PT-facing member view — deliberately shows only what a trainer needs day to day:
// the member's name, any notes (e.g. injuries), and their session history. No
// packages, pricing, or payment status — that stays owner-only.
function MemberSummaryModal({ customer, sessions, staff, onClose }) {
  const now = Date.now();
  const startMs = (s) => new Date(`${s.date}T${s.startTime}:00`).getTime();
  const all = (sessions || []).filter((s) => (s.customerIds || []).includes(customer.id));
  const upcoming = all.filter((s) => startMs(s) >= now).sort((a, b) => startMs(a) - startMs(b));
  const past = all.filter((s) => startMs(s) < now).sort((a, b) => startMs(b) - startMs(a));
  const memberSessions = [...upcoming, ...past];

  return (
    <Modal title={customer.name} onClose={onClose}>
      <div style={styles.fieldLabel}>Notlar</div>
      <div style={{ fontSize: 13.5, color: customer.notes ? "var(--ink)" : "var(--muted)", marginTop: 6, marginBottom: 18, whiteSpace: "pre-wrap" }}>
        {customer.notes || "Not eklenmedi."}
      </div>

      <div style={styles.fieldLabel}>Seanslar</div>
      {memberSessions.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Henüz seans kaydı yok.</div>
      ) : (
        <div style={styles.sessionHistoryList}>
          {memberSessions.map((s) => (
            <MemberSessionRow key={s.id} s={s} staff={staff} customerId={customer.id} />
          ))}
        </div>
      )}

      <div style={styles.modalActions}>
        <button style={styles.primaryBtn} onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}

function MemberSessionRow({ s, staff, customerId }) {
  const pt = staff.find((p) => p.id === s.ptId);
  const ended = sessionEndMs(s) <= Date.now();
  const decided = s.attendance?.[customerId];
  let statusLabel = "Yaklaşan";
  let statusTone = "neutral";
  if (decided === "attended") { statusLabel = "Katıldı"; statusTone = "ok"; }
  else if (decided === "no-show") { statusLabel = "Gelmedi"; statusTone = "neutral"; }
  else if (ended) { statusLabel = "Onay bekliyor"; statusTone = "warn"; }

  return (
    <div style={styles.timelineRow}>
      <div style={{ ...styles.typeDot, background: SESSION_TYPES[s.type].color }} />
      <div style={{ width: 92, fontSize: 12, color: "var(--muted)" }}>{fmtShortDate(s.date)}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{sessionLabel(s)} · {s.startTime}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {SESSION_TYPES[s.type].zone === "upstairs" ? "Üst Kat" : "Alt Kat"}{pt ? ` · ${pt.name}` : ""}
        </div>
      </div>
      <Pill tone={statusTone}>{statusLabel}</Pill>
    </div>
  );
}

/* ---------------------------------------------------------------
   SCHEDULE — the floor-plan visualization + rule engine
------------------------------------------------------------------*/
function unitsUsedAt(sessions, date, startMin, durMin, excludeId) {
  return sessions
    .filter((s) => s.id !== excludeId && s.date === date && SESSION_TYPES[s.type].zone === "downstairs" &&
      overlaps(startMin, durMin, timeToMin(s.startTime), s.durationMin))
    .reduce((sum, s) => sum + SESSION_TYPES[s.type].units, 0);
}

function hasGroupBlock(sessions, date, startMin, durMin, excludeId) {
  return sessions.some((s) =>
    s.id !== excludeId && s.date === date && s.type === "group" &&
    overlaps(startMin, durMin, timeToMin(s.startTime), s.durationMin)
  );
}

// Finds a free named slot (PT-1..4, or Private Zone 1..2) for a session of this
// type. Returns the slot index, or -1 if every slot of that type is taken.
function findAvailableSlot(type, sessions, date, startMin, durMin, excludeId) {
  const slotCount = type === "pt" ? PT_SLOTS : type === "private" ? MAX_PRIVATE_ZONES : 0;
  for (let i = 0; i < slotCount; i++) {
    const clash = sessions.some((s) =>
      s.id !== excludeId && s.date === date && s.type === type && s.slot === i &&
      overlaps(startMin, durMin, timeToMin(s.startTime), s.durationMin)
    );
    if (!clash) return i;
  }
  return -1;
}

function validateNewSession({ type, date, startTime, durationMin, ptId }, sessions, excludeId, staff) {
  const startMin = timeToMin(startTime);
  const errors = [];
  let slot = null;

  // Trainer must actually be available at this day/time.
  if (ptId && staff) {
    const trainer = staff.find((p) => p.id === ptId);
    if (!isTrainerAvailableAt(trainer, date, startTime, durationMin)) {
      errors.push(`${trainer?.name || "Bu antrenör"} bu saatte müsait değil.`);
    }
  }

  // PT double-booking check, across both zones
  if (ptId) {
    const clash = sessions.find((s) =>
      s.id !== excludeId && s.date === date && s.ptId === ptId &&
      overlaps(startMin, durationMin, timeToMin(s.startTime), s.durationMin)
    );
    if (clash) errors.push(`Bu antrenör ${clash.startTime} saatinde zaten dolu.`);
  }

  if (SESSION_TYPES[type].zone === "upstairs") {
    return { errors, slot: null }; // Pilates floor is independent, always open
  }

  if (hasGroupBlock(sessions, date, startMin, durationMin, excludeId)) {
    errors.push("Bu saatte alt kat zaten bir grup dersi tarafından kullanılıyor.");
    return { errors, slot: null };
  }

  if (type === "group") {
    if (unitsUsedAt(sessions, date, startMin, durationMin, excludeId) > 0) {
      errors.push("Alt kat bu saatte zaten kullanımda — grup dersi tüm katı gerektirir.");
    }
    return { errors, slot: null };
  }

  // pt or private: overall floor capacity (4 units total) governs the mix,
  // and each type also has a fixed number of named physical slots.
  const projectedUnits = unitsUsedAt(sessions, date, startMin, durationMin, excludeId) + SESSION_TYPES[type].units;
  if (projectedUnits > DOWNSTAIRS_UNITS) {
    errors.push("Alt kat bu saat için dolu kapasitede.");
    return { errors, slot: null };
  }
  slot = findAvailableSlot(type, sessions, date, startMin, durationMin, excludeId);
  if (slot === -1) {
    errors.push(type === "pt" ? `Bu saatte tüm ${PT_SLOTS} PT alanı dolu.` : "Bu saatte özel alan dolu.");
  }
  return { errors, slot };
}

function ScheduleTab({ sessions, setSessions, staff, customers, onMarkAttendance, setCustomers, commissionRates, setCommissionRates, role, currentPtId, groupClasses }) {
  const [date, setDate] = useState(todayStr());
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [ptFilter, setPtFilter] = useState("");
  const selectedSession = sessions.find((s) => s.id === selectedId) || null;
  // A PT can see the whole floor, but can only book/edit/delete their own sessions.
  const canEdit = (s) => role === "owner" || (currentPtId && s.ptId === currentPtId);

  function addSessions(list) {
    setSessions((prev) => [
      ...prev,
      ...list.map((session) => ({ ...session, id: uid(), attendance: {}, reviewed: false })),
    ]);
    setShowForm(false);
    setPrefill(null);
  }
  function removeSessions(ids) {
    const idSet = new Set(ids);
    ids.forEach((id) => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      // Give back any package session that was already deducted for this booking.
      Object.entries(session.attendance || {}).forEach(([customerId, status]) => {
        if (status === "attended") {
          setCustomers((prev) => prev.map((c) => (c.id === customerId ? refundPackageSession(c, session.type) : c)));
        }
      });
    });
    setSessions((prev) => prev.filter((s) => !idSet.has(s.id)));
  }
  function openForm(prefillValue) {
    setPrefill(prefillValue || null);
    setShowForm(true);
  }
  function moveSession(sessionId, newStartTime) {
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing || !canEdit(existing)) return;
    const check = validateNewSession(
      { type: existing.type, date: existing.date, startTime: newStartTime, durationMin: existing.durationMin, ptId: existing.ptId },
      sessions, sessionId, staff
    );
    if (check.errors.length) {
      alert(check.errors.join("\n"));
      return;
    }
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, startTime: newStartTime, slot: check.slot } : s)));
  }
  // Used to edit a whole recurring series at once (or just one occurrence) — each
  // occurrence is re-validated individually so a conflict in one week doesn't block the rest.
  function updateSessionOccurrences(ids, newStartTime, newDurationMin) {
    let workingSessions = sessions;
    const updates = {};
    const skipped = [];
    ids.forEach((id) => {
      const existing = sessions.find((s) => s.id === id);
      if (!existing) return;
      const check = validateNewSession(
        { type: existing.type, date: existing.date, startTime: newStartTime, durationMin: newDurationMin, ptId: existing.ptId },
        workingSessions, id, staff
      );
      if (check.errors.length) {
        skipped.push(existing);
      } else {
        updates[id] = { startTime: newStartTime, durationMin: newDurationMin, slot: check.slot };
        workingSessions = workingSessions.map((s) => (s.id === id ? { ...s, ...updates[id] } : s));
      }
    });
    setSessions((prev) => prev.map((s) => (updates[s.id] ? { ...s, ...updates[s.id] } : s)));
    if (skipped.length > 0) {
      alert(`${skipped.length} seans çakışma nedeniyle güncellenemedi: ${skipped.map((s) => `${s.date} ${s.startTime}`).join(", ")}`);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Salon programı"
        title={fmtDateHeading(date)}
        action={<button style={styles.primaryBtn} onClick={() => openForm(null)}><Plus size={15} /> Seans ekle</button>}
      />

      <div style={styles.dateNav}>
        <button style={styles.iconBtn} onClick={() => setDate((d) => addDays(d, -1))}><ChevronLeft size={16} /></button>
        <input type="date" style={styles.dateInput} value={date} onChange={(e) => setDate(e.target.value)} />
        <button style={styles.iconBtn} onClick={() => setDate((d) => addDays(d, 1))}><ChevronRight size={16} /></button>
        <button style={styles.linkBtn} onClick={() => setDate(todayStr())}>Bugün</button>
        <select
          style={{ ...styles.dateInput, marginLeft: "auto" }}
          value={ptFilter}
          onChange={(e) => setPtFilter(e.target.value)}
        >
          <option value="">Tüm antrenörler</option>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <FloorPlanGrid
        sessions={sessions} date={date} staff={staff}
        onSelect={(s) => setSelectedId(s.id)}
        highlightPtId={ptFilter}
        onSlotClick={(slot) => openForm(slot)}
        onMoveSession={moveSession}
        canEditSession={canEdit}
      />

      {showForm && (
        <BookSessionModal
          date={date}
          initial={prefill}
          sessions={sessions}
          staff={staff}
          customers={customers}
          onClose={() => { setShowForm(false); setPrefill(null); }}
          onSave={addSessions}
          groupClasses={groupClasses}
          role={role}
          currentPtId={currentPtId}
        />
      )}

      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          sessions={sessions}
          staff={staff}
          customers={customers}
          onClose={() => setSelectedId(null)}
          onMarkAttendance={onMarkAttendance}
          onRemove={(ids) => { removeSessions(ids); setSelectedId(null); }}
          onUpdateSeries={updateSessionOccurrences}
          commissionRates={commissionRates}
          setCommissionRates={setCommissionRates}
          role={role}
          canEdit={canEdit(selectedSession)}
        />
      )}
    </div>
  );
}

function SessionDetailModal({ session, sessions, staff, customers, onClose, onMarkAttendance, onRemove, onUpdateSeries, commissionRates, setCommissionRates, role, canEdit }) {
  const pt = staff.find((p) => p.id === session.ptId);
  const ended = sessionEndMs(session) <= Date.now();
  const type = SESSION_TYPES[session.type];
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStartTime, setEditStartTime] = useState(session.startTime);
  const [editDuration, setEditDuration] = useState(session.durationMin);
  // PT sessions are 1:1, so the member's name is more useful as the title than the generic type label.
  const titlePrefix = session.type === "pt" && session.customerNames ? session.customerNames : sessionLabel(session);

  // Other future sessions with the same single member, trainer, and type — likely part of
  // the same recurring pattern, so deleting or editing can optionally apply to all of them.
  const soloCustomerId = (session.customerIds || []).length === 1 ? session.customerIds[0] : null;
  const relatedSessions = soloCustomerId
    ? sessions.filter((s) =>
        s.id !== session.id && s.ptId === session.ptId && s.type === session.type &&
        (s.customerIds || []).length === 1 && s.customerIds[0] === soloCustomerId &&
        s.date >= session.date
      )
    : [];
  const relatedCustomerName = soloCustomerId ? customers.find((c) => c.id === soloCustomerId)?.name : null;

  function confirmDeleteSingle() {
    if (confirm("Bu seansı silmek istediğinize emin misiniz?")) onRemove([session.id]);
  }
  function applyEdit(ids) {
    onUpdateSeries(ids, editStartTime, Number(editDuration));
    setEditing(false);
    onClose();
  }

  return (
    <Modal title={`${titlePrefix} · ${session.startTime}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        <DetailRow label="Tarih" value={fmtDateHeading(session.date)} />
        <DetailRow label="Saat" value={`${session.startTime} · ${session.durationMin} dk`} />
        {session.type === "group" && session.groupClassName && (
          <DetailRow label="Ders" value={session.groupClassName} />
        )}
        <DetailRow label={session.type === "pilates" ? "Eğitmen" : "Antrenör"} value={pt ? pt.name : "Atanmadı"} />
      </div>

      {editing && (
        <div style={{ ...styles.packageRow, marginBottom: 16 }}>
          <div style={styles.fieldRow}>
            <Field label="Başlangıç saati">
              <HourAwareTimeInput type={session.type} value={editStartTime} onChange={setEditStartTime} />
            </Field>
            {session.type !== "pilates" && (
              <Field label="Süre (dk)">
                <select style={styles.input} value={editDuration} onChange={(e) => setEditDuration(e.target.value)}>
                  {[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtnSm} onClick={() => setEditing(false)}>Vazgeç</button>
            <button style={styles.secondaryBtnSm} onClick={() => applyEdit([session.id])}>Sadece bunu güncelle</button>
            {relatedSessions.length > 0 && (
              <button style={styles.primaryBtnSm} onClick={() => applyEdit([session.id, ...relatedSessions.map((s) => s.id)])}>
                Tümünü güncelle ({relatedSessions.length + 1})
              </button>
            )}
          </div>
        </div>
      )}

      <div style={styles.fieldLabel}>Üyeler</div>
      {(session.customerIds || []).length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 4 }}>Bu seansa bağlı üye yok.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, marginBottom: 16 }}>
        {(session.customerIds || []).map((cid) => {
          const cust = customers.find((c) => c.id === cid);
          if (!cust) return null;
          const pkg = findPackageForType(cust, session.type);
          const decided = session.attendance?.[cid];
          const showCommission = role === "owner" && session.ptId;
          const commissionPct = showCommission ? getCommissionRate(commissionRates, session.ptId, cid, session.type) : null;
          return (
            <div key={cid} style={styles.packageRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: showCommission ? 8 : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{cust.name}</div>
                  {pkg && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                      {pkg.sessionsUsed}/{pkg.sessionCount} seans kullanıldı
                    </div>
                  )}
                </div>
                {decided ? (
                  <Pill tone={decided === "attended" ? "ok" : "neutral"}>{decided === "attended" ? "Katıldı" : "Gelmedi"}</Pill>
                ) : ended && canEdit ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={styles.secondaryBtnSm} onClick={() => onMarkAttendance(session.id, cid, "no-show")}>Gelmedi</button>
                    <button style={styles.primaryBtnSm} onClick={() => onMarkAttendance(session.id, cid, "attended")}>
                      <CheckCircle2 size={13} /> Katıldı
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{ended ? "Onay bekliyor" : "Yaklaşan"}</span>
                )}
              </div>
              {showCommission && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {pt ? pt.name : "Antrenör"} payı ({cust.name}):
                  </span>
                  <input
                    type="number" min="0" max="100" style={{ ...styles.input, width: 64, padding: "5px 8px" }}
                    value={commissionPct}
                    onChange={(e) => {
                      const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setCommissionRates((prev) => ({ ...prev, [commissionKey(session.ptId, cid, session.type)]: pct }));
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.modalActions}>
        {confirmingDelete ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {relatedCustomerName} adlı üyenin {pt ? `${pt.name} ile ` : ""}{sessionLabel(session)} seansından bu tarihten itibaren
              {" "}{relatedSessions.length} tane daha var. Ne yapmak istersiniz?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button style={styles.secondaryBtn} onClick={() => setConfirmingDelete(false)}>Vazgeç</button>
              <button style={styles.secondaryBtn} onClick={() => onRemove([session.id])}>Sadece bunu sil</button>
              <button style={styles.primaryBtn} onClick={() => onRemove([session.id, ...relatedSessions.map((s) => s.id)])}>
                Tümünü sil ({relatedSessions.length + 1})
              </button>
            </div>
          </div>
        ) : !editing ? (
          <>
            {!canEdit && <span style={{ fontSize: 12, color: "var(--muted)", marginRight: "auto" }}>Yalnızca görüntüleme</span>}
            {canEdit && (
              <>
                <button style={styles.secondaryBtn} onClick={() => { setEditStartTime(session.startTime); setEditDuration(session.durationMin); setEditing(true); }}>
                  <Pencil size={13} /> Düzenle
                </button>
                <button
                  style={styles.secondaryBtn}
                  onClick={() => (relatedSessions.length > 0 ? setConfirmingDelete(true) : confirmDeleteSingle())}
                >
                  <Trash2 size={13} /> Seansı sil
                </button>
              </>
            )}
            <button style={styles.primaryBtn} onClick={onClose}>Kapat</button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FloorPlanGrid({ sessions, date, staff, onSelect, highlightPtId, onSlotClick, onMoveSession, canEditSession }) {
  const dayStart = 6 * 60, dayEnd = 22 * 60;
  const totalMin = dayEnd - dayStart;
  const HOUR_HEIGHT = 56; // px per hour — fixed scale, so drag/click math is simple pixel math
  const HEADER_HEIGHT = 34;
  const HOUR_AXIS_WIDTH = 52;
  const totalHeight = (totalMin / 60) * HOUR_HEIGHT;

  // Horizontal gridlines at every hour, plus alternating hour-tall bands, running down each column.
  const vGridStyle = {
    backgroundImage: [
      `repeating-linear-gradient(to bottom, rgba(0,0,0,0.14) 0, rgba(0,0,0,0.14) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
      `repeating-linear-gradient(to bottom, rgba(31,111,84,0.07) 0, rgba(31,111,84,0.07) ${HOUR_HEIGHT}px, transparent ${HOUR_HEIGHT}px, transparent ${HOUR_HEIGHT * 2}px)`,
    ].join(", "),
    backgroundColor: "var(--surface-2)",
  };

  const [drag, setDrag] = useState(null); // { session, startY, originalMin, deltaMin, moved }

  useEffect(() => {
    if (!drag) return;
    const step = drag.session.type === "pilates" ? 30 : 60; // Alt Kat only books on the hour
    function onMouseMove(e) {
      const dy = e.clientY - drag.startY;
      const deltaMinRaw = (dy / HOUR_HEIGHT) * 60;
      // Locked sessions (not this PT's own) never visually move, even mid-drag.
      const deltaMin = drag.editable ? Math.round(deltaMinRaw / step) * step : 0;
      setDrag((d) => (d ? { ...d, deltaMin, moved: Math.abs(dy) > 4 } : d));
    }
    function onMouseUp() {
      setDrag((d) => {
        if (!d) return null;
        if (d.editable && d.moved && d.deltaMin !== 0) {
          const newMin = Math.max(dayStart, Math.min(d.originalMin + d.deltaMin, dayEnd - step));
          onMoveSession(d.session.id, minToTime(newMin));
        } else if (!d.moved) {
          onSelect(d.session);
        }
        return null;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [drag]);

  const daySessions = sessions.filter((s) => s.date === date);
  const groupSessions = daySessions.filter((s) => s.type === "group");

  // Give each trainer a stable "home" PT column (based on their position in the staff
  // list, or an explicit preference) so they land on the same column every day. If two
  // trainers who both have sessions today collide on the same home column, whichever
  // has more sessions today keeps it and the other moves.
  const ptColByTrainer = {};
  {
    const staffIndex = {};
    staff.forEach((s, i) => { staffIndex[s.id] = i; });
    const ptSessionsToday = daySessions.filter((s) => s.type === "pt" && s.ptId);
    const countByTrainer = {};
    ptSessionsToday.forEach((s) => { countByTrainer[s.ptId] = (countByTrainer[s.ptId] || 0) + 1; });
    const trainerIds = Object.keys(countByTrainer);
    const withPref = trainerIds.map((id) => {
      const trainer = staff.find((p) => p.id === id);
      const explicit = trainer?.preferredPtRow != null;
      const pref = explicit ? trainer.preferredPtRow : (staffIndex[id] ?? 0) % PT_SLOTS;
      return { id, pref, explicit, count: countByTrainer[id] };
    });
    const usedCols = new Set();
    [...withPref].sort((a, b) => (b.explicit - a.explicit) || b.count - a.count || a.pref - b.pref).forEach((t) => {
      if (!usedCols.has(t.pref)) { ptColByTrainer[t.id] = t.pref; usedCols.add(t.pref); }
    });
    withPref.forEach((t) => {
      if (ptColByTrainer[t.id] !== undefined) return;
      for (let c = 0; c < PT_SLOTS; c++) {
        if (!usedCols.has(c)) { ptColByTrainer[t.id] = c; usedCols.add(c); return; }
      }
      ptColByTrainer[t.id] = t.pref; // more trainers today than columns — rare fallback
    });
  }

  const columns = [
    { key: "pilates", type: "pilates", label: "Pilates", sessions: daySessions.filter((s) => s.type === "pilates"), blockable: false },
    ...Array.from({ length: PT_SLOTS }, (_, i) => ({
      key: `pt${i}`, type: "pt", label: `PT ${i + 1}`,
      sessions: daySessions.filter((s) => s.type === "pt" && (s.ptId ? ptColByTrainer[s.ptId] === i : s.slot === i)),
      blockable: true,
    })),
    ...Array.from({ length: MAX_PRIVATE_ZONES }, (_, i) => ({
      key: `pz${i}`, type: "private", label: `Private Zone ${i + 1}`,
      sessions: daySessions.filter((s) => s.type === "private" && s.slot === i), blockable: true,
    })),
    { key: "group", type: "group", label: "Grup Dersi", sessions: groupSessions, blockable: false },
  ];

  function renderBlock(s) {
    const isDragging = drag && drag.session.id === s.id;
    const minutesNow = isDragging
      ? Math.max(dayStart, Math.min(drag.originalMin + drag.deltaMin, dayEnd - 30))
      : timeToMin(s.startTime);
    const displayStart = isDragging ? minToTime(minutesNow) : s.startTime;
    const top = ((minutesNow - dayStart) / 60) * HOUR_HEIGHT;
    const height = (s.durationMin / 60) * HOUR_HEIGHT;
    const pt = staff.find((p) => p.id === s.ptId);
    const dimmed = highlightPtId && s.ptId !== highlightPtId;
    const blockColor = pt ? trainerColor(pt) : SESSION_TYPES[s.type].color;
    const primaryText = s.type === "group" ? sessionLabel(s) : (s.customerNames ? s.customerNames : SESSION_TYPES[s.type].label);
    const editable = !canEditSession || canEditSession(s);
    return (
      <div
        key={s.id}
        title={`${displayStart} · ${sessionLabel(s)}${pt ? ` · ${pt.name}` : ""}${s.customerNames ? ` · ${s.customerNames}` : ""}${!editable ? " · yalnızca görüntüleme" : ""}`}
        style={{
          position: "absolute", left: 3, right: 3, top: `${top + 2}px`, height: `${Math.max(height - 4, 20)}px`,
          borderRadius: 6, overflow: "hidden", cursor: !editable ? "pointer" : (isDragging ? "grabbing" : "grab"),
          display: "flex", flexDirection: "column", justifyContent: "center", padding: "2px 7px",
          background: blockColor,
          opacity: dimmed && !isDragging ? 0.25 : (editable ? 1 : 0.7),
          zIndex: isDragging ? 5 : 1,
          boxShadow: isDragging ? "0 4px 14px rgba(0,0,0,0.25)" : "none",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setDrag({
            session: s, startY: e.clientY, editable,
            originalMin: timeToMin(s.startTime), deltaMin: 0, moved: false,
          });
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.sessionBlockLabel}>{primaryText}</div>
        {pt && <div style={styles.sessionBlockSubLabel}>{pt.name}</div>}
      </div>
    );
  }

  function handleTrackClick(e, col) {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let minutes = dayStart + (offsetY / HOUR_HEIGHT) * 60;
    const step = col.type === "pilates" ? 30 : 60; // Alt Kat only books on the hour
    minutes = Math.round(minutes / step) * step;
    minutes = Math.max(dayStart, Math.min(minutes, dayEnd - step));
    onSlotClick({ type: col.type, startTime: minToTime(minutes) });
  }

  return (
    <Card title="">
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", minWidth: HOUR_AXIS_WIDTH + columns.length * 112 }}>
          <div style={{ width: HOUR_AXIS_WIDTH, flexShrink: 0, position: "sticky", left: 0, background: "var(--surface)", zIndex: 2, borderRight: "1px solid var(--border)" }}>
            <div style={{ height: HEADER_HEIGHT }} />
            <div style={{ position: "relative", height: totalHeight }}>
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{
                    position: "absolute", top: `${((h * 60 - dayStart) / 60) * HOUR_HEIGHT}px`,
                    transform: "translateY(-50%)", right: 8, fontSize: 11.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap",
                  }}
                >
                  {h}:00
                </div>
              ))}
            </div>
          </div>

          {columns.map((col, idx) => (
            <div
              key={col.key}
              style={{
                flex: "1 0 112px", minWidth: 112,
                borderLeft: idx === 1 ? "2px solid var(--border)" : "1px solid var(--surface-2)",
              }}
            >
              <div
                style={{
                  height: HEADER_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11.5, fontWeight: 700, color: "var(--ink)", textAlign: "center", padding: "0 4px",
                  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {col.label}
              </div>
              <div
                style={{ position: "relative", height: totalHeight, cursor: "pointer", ...vGridStyle }}
                onClick={(e) => handleTrackClick(e, col)}
              >
                {col.blockable && groupSessions.map((g) => {
                  const top = ((timeToMin(g.startTime) - dayStart) / 60) * HOUR_HEIGHT;
                  const height = (g.durationMin / 60) * HOUR_HEIGHT;
                  return (
                    <div
                      key={g.id + "-block"}
                      title="Kat dolu — grup dersi"
                      style={{ ...styles.blockedOverlay, left: 3, right: 3, top: `${top}px`, bottom: "auto", height: `${height}px` }}
                    />
                  );
                })}
                {col.sessions.length === 0 && !(col.blockable && groupSessions.length > 0) && (
                  <div style={{ position: "absolute", top: 6, left: 6, fontSize: 11, color: "var(--muted)" }}>Boş</div>
                )}
                {col.sessions.map(renderBlock)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.legendRow}>
        {staff.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 9, height: 9, borderRadius: 3, background: trainerColor(p) }} />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{p.name}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: "repeating-linear-gradient(135deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 2px, transparent 2px, transparent 4px)" }} />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Grup dersi tarafından bloklandı</span>
        </div>
      </div>
    </Card>
  );
}

// Downstairs (Alt Kat) sessions can only start on the hour; Pilates keeps free timing.
function HourAwareTimeInput({ type, value, onChange }) {
  if (type === "pilates") {
    return <input type="time" style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
      {HOURS.map((h) => {
        const t = `${String(h).padStart(2, "0")}:00`;
        return <option key={t} value={t}>{t}</option>;
      })}
    </select>
  );
}

function BookSessionModal({ date, initial, sessions, staff, customers, onClose, onSave, groupClasses, role, currentPtId }) {
  const [type, setType] = useState(initial?.type || "pt");
  const [startTime, setStartTime] = useState(initial?.startTime || "09:00");
  const [durationMin, setDurationMin] = useState(initial?.type === "pilates" ? 45 : 60);
  const [ptId, setPtId] = useState(role === "pt" ? currentPtId : (staff[0]?.id || ""));
  const [customerIds, setCustomerIds] = useState([]);
  const [errors, setErrors] = useState([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [groupClassId, setGroupClassId] = useState("");

  const [extraDays, setExtraDays] = useState([]);
  const [extraTime, setExtraTime] = useState(initial?.startTime || "09:00");
  const [otherPkgSelections, setOtherPkgSelections] = useState({});
  const [recurring, setRecurring] = useState(false);
  const [weeksCount, setWeeksCount] = useState(1);

  const selectedGroupClass = groupClasses.find((g) => g.id === groupClassId) || null;
  const capacity = type === "private" ? PRIVATE_ZONE_CAP : type === "group" ? (selectedGroupClass?.capacity || GROUP_CLASS_CAP) : type === "pt" ? 1 : null;

  // Is this trainer already booked somewhere at the currently chosen date/time?
  function isTrainerBusy(staffId) {
    const startMin = timeToMin(startTime);
    return sessions.some((s) =>
      s.ptId === staffId && s.date === date &&
      overlaps(startMin, Number(durationMin), timeToMin(s.startTime), s.durationMin)
    );
  }
  // "unavailable" (doesn't work that day/hour) takes priority over "busy" (works, but double-booked).
  function trainerStatus(staffId) {
    const trainer = staff.find((p) => p.id === staffId);
    if (!isTrainerAvailableAt(trainer, date, startTime, durationMin)) return "unavailable";
    if (isTrainerBusy(staffId)) return "busy";
    return "free";
  }

  const singleCustomer = customerIds.length === 1 ? customers.find((c) => c.id === customerIds[0]) : null;
  const primaryPkg = singleCustomer ? findPackageForType(singleCustomer, type) : null;
  const frequency = primaryPkg ? Math.round(primaryPkg.sessionCount / 4) : null; // 8-pack ≈ 2x/week, 12-pack ≈ 3x/week
  const extraNeeded = frequency ? Math.max(0, frequency - 1) : 0;
  const otherPackages = singleCustomer
    ? (singleCustomer.packages || []).filter((p) => p.type !== type && (p.sessionCount - p.sessionsUsed) > 0)
    : [];

  useEffect(() => {
    setExtraDays([]);
    setOtherPkgSelections({});
    if (type !== "group") setGroupClassId("");
  }, [type, singleCustomer?.id]);

  useEffect(() => {
    if (capacity && customerIds.length > capacity) {
      setCustomerIds((prev) => prev.slice(0, capacity));
    }
  }, [capacity]);

  useEffect(() => {
    if (type === "pilates") {
      setDurationMin(45); // Pilates is always 45 minutes
    } else {
      // Alt Kat only books on the hour — snap whatever time is set to the nearest hour.
      const hour = Math.max(6, Math.min(Math.round(timeToMin(startTime) / 60), 21));
      const snapped = `${String(hour).padStart(2, "0")}:00`;
      if (snapped !== startTime) setStartTime(snapped);
    }
  }, [type]);

  useEffect(() => {
    if (primaryPkg && frequency) {
      const remaining = Math.max(1, primaryPkg.sessionCount - primaryPkg.sessionsUsed);
      setWeeksCount(Math.max(1, Math.ceil(remaining / frequency)));
    }
  }, [singleCustomer?.id, type]);

  function toggleCustomer(id) {
    setCustomerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (capacity && prev.length >= capacity) return prev;
      return [...prev, id];
    });
  }
  function toggleExtraDay(wd) {
    setExtraDays((prev) => {
      if (prev.includes(wd)) return prev.filter((x) => x !== wd);
      if (prev.length >= extraNeeded) return prev;
      return [...prev, wd];
    });
  }
  function toggleOtherPkg(pkgType) {
    setOtherPkgSelections((prev) => {
      const cur = prev[pkgType] || { enabled: false, date, startTime: "09:00" };
      return { ...prev, [pkgType]: { ...cur, enabled: !cur.enabled } };
    });
  }
  function updateOtherPkg(pkgType, field, value) {
    setOtherPkgSelections((prev) => {
      const cur = prev[pkgType] || { enabled: true, date, startTime: "09:00" };
      return { ...prev, [pkgType]: { ...cur, [field]: value } };
    });
  }

  function handleSubmit() {
    if (role === "pt" && !currentPtId) {
      setErrors(["Devam etmeden önce sol menüden kim olduğunuzu seçin."]);
      return;
    }
    if (type === "group" && !groupClassId) {
      setErrors(["Lütfen bir grup dersi türü seçin."]);
      return;
    }
    const primaryCheck = validateNewSession({ type, date, startTime, durationMin: Number(durationMin), ptId }, sessions, undefined, staff);
    if (primaryCheck.errors.length) { setErrors(primaryCheck.errors); return; }

    const names = customerIds.map((id) => customers.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
    const groupClassName = selectedGroupClass?.name || null;

    // Each "spec" is one weekly occurrence pattern; specs get expanded across weeks below.
    const specs = [{ type, baseDate: date, startTime, ptId, customerIds, customerNames: names, groupClassId: type === "group" ? groupClassId : null, groupClassName: type === "group" ? groupClassName : null }];

    if (singleCustomer && extraDays.length > 0) {
      const monday = getWeekRange(date).start;
      extraDays.forEach((wd) => {
        specs.push({
          type, baseDate: addDays(monday, wd - 1), startTime: extraTime || startTime,
          ptId, customerIds, customerNames: names,
          groupClassId: type === "group" ? groupClassId : null, groupClassName: type === "group" ? groupClassName : null,
        });
      });
    }

    Object.entries(otherPkgSelections).forEach(([pkgType, sel]) => {
      if (sel.enabled && sel.date && sel.startTime) {
        specs.push({ type: pkgType, baseDate: sel.date, startTime: sel.startTime, ptId, customerIds, customerNames: names, groupClassId: null, groupClassName: null });
      }
    });

    const weeks = recurring ? Math.max(1, Number(weeksCount) || 1) : 1;
    const candidates = [];
    specs.forEach((spec) => {
      for (let w = 0; w < weeks; w++) {
        candidates.push({
          type: spec.type,
          date: addDays(spec.baseDate, w * 7),
          startTime: spec.startTime,
          durationMin: Number(durationMin),
          ptId: spec.ptId || null,
          customerIds: spec.customerIds,
          customerNames: spec.customerNames,
          groupClassId: spec.groupClassId,
          groupClassName: spec.groupClassName,
        });
      }
    });

    let workingSessions = sessions;
    const accepted = [];
    const skipped = [];
    candidates.forEach((c) => {
      const { errors: errs, slot } = validateNewSession(c, workingSessions, undefined, staff);
      if (errs.length) {
        skipped.push(c);
      } else {
        const withSlot = { ...c, slot };
        accepted.push(withSlot);
        workingSessions = [...workingSessions, withSlot];
      }
    });

    onSave(accepted);

    if (skipped.length > 0) {
      const list = skipped.map((c) => `${c.date} ${c.startTime}`).join(", ");
      alert(`${skipped.length} seans çakışma nedeniyle eklenemedi: ${list}`);
    }
  }

  return (
    <Modal title="Yeni seans ekle" onClose={onClose}>
      <Field label="Tür">
        <div style={styles.typeSelectRow}>
          {Object.entries(SESSION_TYPES).map(([key, v]) => (
            <button
              key={key}
              onClick={() => { setType(key); setCustomerIds([]); setErrors([]); }}
              style={{
                ...styles.typeChip,
                borderColor: type === key ? v.color : "var(--border)",
                background: type === key ? v.color + "1a" : "transparent",
                color: type === key ? v.color : "var(--ink)",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </Field>

      {type === "group" && (
        <Field label="Hangi ders?">
          {groupClasses.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Henüz grup dersi türü yok. Grup Dersleri sekmesinden ekleyin.
            </div>
          ) : (
            <select style={styles.input} value={groupClassId} onChange={(e) => { setGroupClassId(e.target.value); setErrors([]); }}>
              <option value="">Seçin…</option>
              {groupClasses.map((g) => (
                <option key={g.id} value={g.id}>{g.name} (maks {g.capacity})</option>
              ))}
            </select>
          )}
        </Field>
      )}

      <div style={styles.fieldRow}>
        <Field label="Başlangıç saati">
          <HourAwareTimeInput type={type} value={startTime} onChange={(v) => { setStartTime(v); setErrors([]); }} />
        </Field>
        <Field label="Süre (dk)">
          {type === "pilates" ? (
            <input style={{ ...styles.input, background: "var(--surface-2)", color: "var(--muted)" }} value="45 (sabit)" disabled />
          ) : (
            <select style={styles.input} value={durationMin} onChange={(e) => { setDurationMin(e.target.value); setErrors([]); }}>
              {[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </Field>
      </div>

      <Field label={type === "pilates" ? "Eğitmen" : "Antrenör"}>
        {role === "pt" ? (
          <input style={{ ...styles.input, background: "var(--surface-2)", color: "var(--muted)" }} value={staff.find((p) => p.id === currentPtId)?.name || "Seçilmedi"} disabled />
        ) : (
          <select style={styles.input} value={ptId} onChange={(e) => { setPtId(e.target.value); setErrors([]); }}>
            <option value="">Atanmadı</option>
            {staff.map((p) => {
              const status = trainerStatus(p.id);
              const label = status === "unavailable" ? " (Müsait değil)" : status === "busy" ? " (Dolu)" : "";
              return (
                <option key={p.id} value={p.id} disabled={status !== "free"}>
                  {p.name}{label}
                </option>
              );
            })}
          </select>
        )}
      </Field>

      <Field label={`Üyeler${capacity ? ` (maks ${capacity})` : ""}`}>
        <div style={styles.memberSearchBar}>
          <Search size={14} color="var(--muted)" />
          <input
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="Üye ara…"
            style={styles.searchInput}
          />
        </div>
        <div style={styles.customerPickList}>
          {customers.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>Henüz kayıtlı üye yok.</div>}
          {customers
            .filter((c) => customerIds.includes(c.id) || c.name.toLowerCase().includes(memberQuery.toLowerCase()))
            .map((c) => {
              const checked = customerIds.includes(c.id);
              const pkg = findPackageForType(c, type);
              const noPackageForType = !pkg;
              const packExhausted = pkg && pkg.sessionsUsed >= pkg.sessionCount;
              return (
                <label key={c.id} style={styles.customerPickRow}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCustomer(c.id)} />
                  <span>{c.name}</span>
                  {noPackageForType ? (
                    <span style={{ fontSize: 11, color: "#C1443C", marginLeft: "auto" }}>
                      {SESSION_TYPES[type].label} paketi yok
                    </span>
                  ) : packExhausted ? (
                    <span style={{ fontSize: 11, color: "#C1443C", marginLeft: "auto" }}>
                      {SESSION_TYPES[type].label}: seansı bitti ({pkg.sessionsUsed}/{pkg.sessionCount})
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{pkg.sessionsUsed}/{pkg.sessionCount}</span>
                  )}
                </label>
              );
            })}
          {customers.length > 0 &&
            customers.filter((c) => customerIds.includes(c.id) || c.name.toLowerCase().includes(memberQuery.toLowerCase())).length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)", padding: "4px 2px" }}>Eşleşen üye yok.</div>
          )}
        </div>
      </Field>

      {singleCustomer && frequency && extraNeeded > 0 && (
        <Field label={`Haftalık program (haftada ${frequency}x) — ${extraDays.length}/${extraNeeded} gün seçildi`}>
          <div style={styles.typeSelectRow}>
            {[1, 2, 3, 4, 5, 6, 7].filter((wd) => wd !== isoWeekday(date)).map((wd) => {
              const active = extraDays.includes(wd);
              return (
                <button
                  key={wd}
                  onClick={() => toggleExtraDay(wd)}
                  style={{
                    ...styles.typeChip,
                    borderColor: active ? "var(--brand)" : "var(--border)",
                    background: active ? "rgba(0,0,0,0.06)" : "transparent",
                  }}
                >
                  {WEEKDAY_LABELS_TR[wd - 1]}
                </button>
              );
            })}
          </div>
          {extraDays.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Field label="Bu günler için saat">
                <HourAwareTimeInput type={type} value={extraTime} onChange={setExtraTime} />
              </Field>
            </div>
          )}
        </Field>
      )}

      {singleCustomer && otherPackages.length > 0 && (
        <Field label="Bu üyenin diğer paketleri">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {otherPackages.map((p) => {
              const sel = otherPkgSelections[p.type] || { enabled: false, date, startTime: "09:00" };
              return (
                <div key={p.type} style={styles.packageRow}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: sel.enabled ? 8 : 0, cursor: "pointer" }}>
                    <input type="checkbox" checked={sel.enabled} onChange={() => toggleOtherPkg(p.type)} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{SESSION_TYPES[p.type].label}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>({p.sessionsUsed}/{p.sessionCount})</span>
                  </label>
                  {sel.enabled && (
                    <div style={styles.fieldRow}>
                      <Field label="Tarih">
                        <input type="date" style={styles.input} value={sel.date} onChange={(e) => updateOtherPkg(p.type, "date", e.target.value)} />
                      </Field>
                      <Field label="Saat">
                        <HourAwareTimeInput type={p.type} value={sel.startTime} onChange={(v) => updateOtherPkg(p.type, "startTime", v)} />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Field>
      )}

      <Field label="Tekrar">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span style={{ fontSize: 13.5 }}>Bu saatler her hafta tekrarlansın</span>
        </label>
        {recurring && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Kaç hafta:</span>
            <input type="number" min="1" max="26" style={{ ...styles.input, width: 70 }} value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)} />
          </div>
        )}
      </Field>

      {errors.length > 0 && (
        <div style={styles.errorBox}>
          {errors.map((e, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {e}</div>)}
        </div>
      )}

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>İptal</button>
        <button style={styles.primaryBtn} onClick={handleSubmit}>Seansı onayla</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------
   PAYMENTS
------------------------------------------------------------------*/
function PaymentsTab({ customers, setCustomers, sessions, staff }) {
  const [viewingCustomerId, setViewingCustomerId] = useState(null);

  function markPackagePaid(customerId, pkgId) {
    setCustomers((prev) => prev.map((c) => {
      if (c.id !== customerId) return c;
      return { ...c, packages: (c.packages || []).map((p) => (p.id === pkgId ? { ...p, paid: true, paidDate: todayStr() } : p)) };
    }));
  }
  function upsertCustomer(updated) {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setViewingCustomerId(null);
  }

  // Only unpaid packages show here — once marked paid, they drop off the list.
  const unpaidRows = [];
  customers.forEach((c) => {
    (c.packages || []).forEach((p) => { if (!p.paid) unpaidRows.push({ customer: c, pkg: p }); });
  });
  unpaidRows.sort((a, b) => (a.pkg.purchaseDate || "").localeCompare(b.pkg.purchaseDate || ""));

  const viewingCustomer = customers.find((c) => c.id === viewingCustomerId) || null;

  // For each unpaid row, find that member's soonest upcoming session of the matching type,
  // so the owner knows exactly when they'll next see them to collect payment.
  function nextSessionFor(customerId, type) {
    const now = Date.now();
    const upcoming = sessions
      .filter((s) => (s.customerIds || []).includes(customerId) && s.type === type && sessionEndMs(s) > now)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    return upcoming[0] || null;
  }

  return (
    <div>
      <PageHeader eyebrow={`${unpaidRows.length} paket ödemesi bekliyor`} title="Ödemeler" />

      <Card title="Beklenen Ödemeler">
        {unpaidRows.length === 0 && <EmptyState text="Bekleyen paket ödemesi yok." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {unpaidRows.map(({ customer, pkg }) => {
            const next = nextSessionFor(customer.id, pkg.type);
            const nextPt = next ? staff.find((p) => p.id === next.ptId) : null;
            return (
            <div key={pkg.id} style={styles.paymentRow}>
              <div style={{ flex: 1 }}>
                <button
                  onClick={() => setViewingCustomerId(customer.id)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink)", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                    {customer.name}
                  </div>
                </button>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {SESSION_TYPES[pkg.type].label} · {pkg.sessionCount} seans{pkg.price ? ` · ${pkg.price} TL` : ""}
                </div>
                <div style={{ fontSize: 12, color: next ? "var(--brand)" : "var(--muted)", marginTop: 2, fontWeight: next ? 600 : 400 }}>
                  {next
                    ? `Sıradaki seans: ${fmtShortDate(next.date)} · ${next.startTime}${nextPt ? ` · ${nextPt.name}` : ""}`
                    : "Planlanmış seans yok"}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Ödendi</span>
                <input type="checkbox" checked={false} onChange={() => markPackagePaid(customer.id, pkg.id)} />
              </label>
            </div>
            );
          })}
        </div>
      </Card>

      {viewingCustomer && (
        <CustomerModal
          initial={viewingCustomer}
          onClose={() => setViewingCustomerId(null)}
          onSave={upsertCustomer}
          sessions={sessions}
          staff={staff}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   FINANSAL RAPORLAR — monthly revenue (from packages purchased)
   vs. trainer payouts (from computeTrainerEarnings per trainer).
------------------------------------------------------------------*/
function FinancialReportsTab({ customers, sessions, staff, commissionRates }) {
  const [month, setMonth] = useState(currentMonthStr());

  // Revenue is recognized when a package is purchased, not when sessions are used.
  const revenueRows = [];
  customers.forEach((c) => {
    (c.packages || []).forEach((p) => {
      if (p.purchaseDate && p.purchaseDate.startsWith(month) && p.price) {
        revenueRows.push({ customer: c, pkg: p });
      }
    });
  });
  const totalRevenue = revenueRows.reduce((sum, r) => sum + (r.pkg.price || 0), 0);

  const revenueByType = {};
  revenueRows.forEach((r) => {
    revenueByType[r.pkg.type] = (revenueByType[r.pkg.type] || 0) + (r.pkg.price || 0);
  });

  const trainerPayouts = staff
    .map((s) => ({ staffMember: s, ...computeTrainerEarnings(s.id, month, sessions, customers, commissionRates) }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
  const totalPayouts = trainerPayouts.reduce((sum, t) => sum + t.total, 0);

  const net = totalRevenue - totalPayouts;

  return (
    <div>
      <PageHeader eyebrow="Aylık özet" title="Finansal Raporlar" />

      <div style={styles.dateNav}>
        <button style={styles.iconBtn} onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1, textTransform: "capitalize" }}>{monthLabel(month)}</div>
        <button style={styles.iconBtn} onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight size={16} /></button>
        <button style={styles.linkBtn} onClick={() => setMonth(currentMonthStr())}>Bu ay</button>
      </div>

      <div style={{ ...styles.grid3, marginTop: 18 }}>
        <StatCard label="Toplam gelir (paket satışı)" value={`${totalRevenue.toFixed(0)} TL`} icon={Wallet} tone="ok" />
        <StatCard label="Antrenör ödemeleri" value={`${totalPayouts.toFixed(0)} TL`} icon={Dumbbell} tone="warn" />
        <StatCard label="Net" value={`${net.toFixed(0)} TL`} icon={TrendingUp} tone={net >= 0 ? "ok" : "danger"} />
      </div>

      <div style={styles.twoCol}>
        <Card title="Pakete göre gelir">
          {revenueRows.length === 0 && <EmptyState text="Bu ay satılan paket yok." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(revenueByType).map(([type, amount]) => (
              <div key={type} style={styles.paymentRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ ...styles.typeDot, background: SESSION_TYPES[type].color }} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{SESSION_TYPES[type].label}</span>
                </div>
                <span style={{ fontWeight: 700 }}>{amount.toFixed(0)} TL</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Antrenöre göre ödeme">
          {trainerPayouts.length === 0 && <EmptyState text="Bu ay ödenecek antrenör yok." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {trainerPayouts.map((t) => (
              <div key={t.staffMember.id} style={styles.paymentRow}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.staffMember.name}</span>
                <span style={{ fontWeight: 700 }}>{t.total.toFixed(0)} TL</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   HOCALAR (STAFF)
------------------------------------------------------------------*/
function StaffTab({ staff, setStaff, sessions, customers, commissionRates, setCommissionRates }) {
  const [staffModalTarget, setStaffModalTarget] = useState(null); // null | "new" | trainer object
  const [viewingId, setViewingId] = useState(null);

  const { start, end } = getWeekRange(todayStr());
  const now = Date.now();
  const viewingStaff = staff.find((s) => s.id === viewingId) || null;

  function saveStaff(data) {
    if (staffModalTarget && staffModalTarget !== "new") {
      setStaff((prev) => prev.map((s) => (s.id === staffModalTarget.id ? { ...s, ...data } : s)));
    } else {
      // data.id comes back from the invite API — the login already exists by this point.
      setStaff((prev) => [...prev, { color: TRAINER_PALETTE[prev.length % TRAINER_PALETTE.length], ...data }]);
    }
    setStaffModalTarget(null);
  }
  function removeStaff(id) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }
  function weeklyCompleted(staffId) {
    return sessions.filter((s) =>
      s.ptId === staffId && s.date >= start && s.date <= end && sessionEndMs(s) <= now
    ).length;
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${staff.length} antrenör`}
        title="Antrenörler"
        action={
          <button style={styles.primaryBtn} onClick={() => setStaffModalTarget("new")}>
            <Plus size={15} /> Ekle
          </button>
        }
      />

      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
        Bu hafta ({start} – {end}) tamamlanan seans sayıları
      </div>

      {staff.length === 0 && <EmptyState text="Henüz antrenör eklenmedi." />}

      <div style={styles.customerList}>
        {staff.map((s) => {
          const av = normalizeAvailability(s.availability);
          return (
            <div key={s.id} style={styles.customerCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={() => setViewingId(s.id)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink)", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                    {s.name}
                  </div>
                </button>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.iconBtn} onClick={() => setStaffModalTarget(s)}><Pencil size={14} /></button>
                  <button style={styles.iconBtn} onClick={() => { if (confirm(`${s.name} adlı antrenörü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) removeStaff(s.id); }}><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {ALL_WEEKDAYS.map((wd) => {
                  const day = av[wd];
                  const tone = !day.on ? "off" : day.allDay ? "full" : "partial";
                  const bg = tone === "full" ? "#E1F0EA" : tone === "partial" ? "#FBF0DC" : "var(--surface-2)";
                  const fg = tone === "full" ? "#1F6F54" : tone === "partial" ? "#95651A" : "var(--muted)";
                  const title = !day.on
                    ? `${WEEKDAY_LABELS_TR[wd - 1]}: kapalı`
                    : day.allDay
                    ? `${WEEKDAY_LABELS_TR[wd - 1]}: tüm gün`
                    : `${WEEKDAY_LABELS_TR[wd - 1]}: ${day.blocks.map((b) => `${b.start}–${b.end}`).join(", ")}`;
                  return (
                    <span
                      key={wd}
                      title={title}
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                        background: bg,
                        color: fg,
                        textDecoration: tone === "off" ? "line-through" : "none",
                      }}
                    >
                      {WEEKDAY_SHORT_TR[wd - 1]}
                    </span>
                  );
                })}
              </div>
              <div style={styles.customerMetaRow}>
                <Pill tone="neutral">{weeklyCompleted(s.id)} seans · bu hafta</Pill>
              </div>
            </div>
          );
        })}
      </div>

      {viewingStaff && (
        <TrainerScheduleModal
          trainer={viewingStaff}
          sessions={sessions}
          customers={customers}
          commissionRates={commissionRates}
          setCommissionRates={setCommissionRates}
          onClose={() => setViewingId(null)}
        />
      )}

      {staffModalTarget && (
        <StaffModal
          initial={staffModalTarget === "new" ? null : staffModalTarget}
          onClose={() => setStaffModalTarget(null)}
          onSave={saveStaff}
        />
      )}
    </div>
  );
}

function StaffModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availability, setAvailability] = useState(normalizeAvailability(initial?.availability));
  const [preferredPtRow, setPreferredPtRow] = useState(initial?.preferredPtRow ?? "");

  function toggleDayOn(wd) {
    setAvailability((prev) => ({ ...prev, [wd]: { ...prev[wd], on: !prev[wd].on } }));
  }
  function toggleAllDay(wd) {
    setAvailability((prev) => {
      const day = prev[wd];
      const goingCustom = day.allDay; // was all-day, switching to custom hours
      return {
        ...prev,
        [wd]: {
          ...day,
          allDay: !day.allDay,
          blocks: goingCustom && day.blocks.length === 0 ? [{ start: "08:00", end: "17:00" }] : day.blocks,
        },
      };
    });
  }
  function addBlock(wd) {
    setAvailability((prev) => {
      const day = prev[wd];
      const last = day.blocks[day.blocks.length - 1];
      const newBlock = { start: last ? last.end : "08:00", end: "21:00" };
      return { ...prev, [wd]: { ...day, blocks: [...day.blocks, newBlock] } };
    });
  }
  function removeBlock(wd, idx) {
    setAvailability((prev) => {
      const day = prev[wd];
      if (day.blocks.length <= 1) return prev; // keep at least one block while on custom hours
      return { ...prev, [wd]: { ...day, blocks: day.blocks.filter((_, i) => i !== idx) } };
    });
  }
  function updateBlock(wd, idx, field, value) {
    setAvailability((prev) => {
      const day = prev[wd];
      const blocks = day.blocks.map((b, i) => (i === idx ? { ...b, [field]: value } : b));
      return { ...prev, [wd]: { ...day, blocks } };
    });
  }
  async function handleSave() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), availability, preferredPtRow: preferredPtRow === "" ? null : Number(preferredPtRow) };
    if (initial) {
      // Editing an existing trainer's schedule details doesn't touch their login.
      onSave(payload);
      return;
    }
    if (!email.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/invite-staff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), role: makeAdmin ? "owner" : "pt" }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || "Davet gönderilirken bir sorun oluştu.");
        setSaving(false);
        return;
      }
      onSave({ ...payload, id: result.staffId, _dbRole: makeAdmin ? "owner" : "pt" });
    } catch (err) {
      alert("Davet gönderilemedi: " + err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Antrenörü düzenle" : "Yeni antrenör ekle"} onClose={onClose}>
      <Field label="Ad Soyad">
        <input
          autoFocus
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </Field>

      {!initial && (
        <>
          <Field label="E-posta">
            <input
              type="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="antrenor@ornek.com"
            />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16 }}>
            <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
            <span style={{ fontSize: 13.5 }}>Bu kişi admin olsun</span>
          </label>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -10, marginBottom: 16 }}>
            <Mail size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Kaydettiğinizde bu adrese şifre belirleme daveti gönderilecek.
          </div>
        </>
      )}

      <Field label="Tercih edilen PT sırası">
        <select style={styles.input} value={preferredPtRow} onChange={(e) => setPreferredPtRow(e.target.value)}>
          <option value="">Otomatik (listedeki sıraya göre)</option>
          {Array.from({ length: PT_SLOTS }, (_, i) => (
            <option key={i} value={i}>{`PT ${i + 1}`}</option>
          ))}
        </select>
      </Field>

      <div style={styles.fieldLabel}>Müsaitlik</div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", marginTop: 6, marginBottom: 16 }}>
        {ALL_WEEKDAYS.map((wd) => {
          const day = availability[wd];
          return (
            <div
              key={wd}
              style={{
                padding: "8px 12px",
                borderBottom: wd < 7 ? "1px solid var(--surface-2)" : "none",
                background: day.on ? "transparent" : "var(--surface-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, width: 74, cursor: "pointer", flexShrink: 0 }}>
                  <input type="checkbox" checked={day.on} onChange={() => toggleDayOn(wd)} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{WEEKDAY_SHORT_TR[wd - 1]}</span>
                </label>
                {day.on && (
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                    <input type="checkbox" checked={day.allDay} onChange={() => toggleAllDay(wd)} />
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Tüm gün</span>
                  </label>
                )}
              </div>

              {day.on && !day.allDay && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, marginLeft: 84 }}>
                  {day.blocks.map((b, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <select
                        style={{ ...styles.input, width: 76, padding: "5px 8px" }}
                        value={b.start}
                        onChange={(e) => updateBlock(wd, idx, "start", e.target.value)}
                      >
                        {HOURS.map((h) => { const t = `${String(h).padStart(2, "0")}:00`; return <option key={t} value={t}>{t}</option>; })}
                      </select>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>–</span>
                      <select
                        style={{ ...styles.input, width: 76, padding: "5px 8px" }}
                        value={b.end}
                        onChange={(e) => updateBlock(wd, idx, "end", e.target.value)}
                      >
                        {HOURS.map((h) => { const t = `${String(h).padStart(2, "0")}:00`; return <option key={t} value={t}>{t}</option>; })}
                      </select>
                      {day.blocks.length > 1 && (
                        <button style={{ ...styles.iconBtn, width: 26, height: 26 }} onClick={() => removeBlock(wd, idx)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    style={{ ...styles.secondaryBtnSm, alignSelf: "flex-start" }}
                    onClick={() => addBlock(wd)}
                  >
                    <Plus size={12} /> Saat ekle
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose} disabled={saving}>İptal</button>
        <button style={styles.primaryBtn} onClick={handleSave} disabled={saving}>
          {saving ? "Gönderiliyor…" : "Kaydet"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------
   GRUP DERSLERİ — the catalog of class types (HIIT, High Rocks, etc.)
   used when booking a "Grup Dersi" session, each with its own capacity.
------------------------------------------------------------------*/
function GroupClassesTab({ groupClasses, setGroupClasses, sessions }) {
  const [modalTarget, setModalTarget] = useState(null); // null | "new" | class object

  function saveClass(data) {
    if (modalTarget && modalTarget !== "new") {
      setGroupClasses((prev) => prev.map((g) => (g.id === modalTarget.id ? { ...g, ...data } : g)));
    } else {
      setGroupClasses((prev) => [...prev, { id: uid(), ...data }]);
    }
    setModalTarget(null);
  }
  function removeClass(id) {
    setGroupClasses((prev) => prev.filter((g) => g.id !== id));
  }
  function upcomingCount(classId) {
    const now = Date.now();
    return sessions.filter((s) => s.groupClassId === classId && sessionEndMs(s) > now).length;
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${groupClasses.length} ders türü`}
        title="Grup Dersleri"
        action={
          <button style={styles.primaryBtn} onClick={() => setModalTarget("new")}>
            <Plus size={15} /> Ekle
          </button>
        }
      />

      {groupClasses.length === 0 && (
        <EmptyState text="Henüz grup dersi türü eklenmedi. Örn. HIIT, High Rocks — her birine bir kapasite verin." />
      )}

      <div style={styles.customerList}>
        {groupClasses.map((g) => (
          <div key={g.id} style={styles.customerCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{g.name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.iconBtn} onClick={() => setModalTarget(g)}><Pencil size={14} /></button>
                <button style={styles.iconBtn} onClick={() => { if (confirm(`${g.name} grup dersini silmek istediğinize emin misiniz?`)) removeClass(g.id); }}><Trash2 size={14} /></button>
              </div>
            </div>
            <div style={styles.customerMetaRow}>
              <Pill tone="neutral">Maks {g.capacity} kişi</Pill>
              <Pill tone="neutral">{upcomingCount(g.id)} planlanan seans</Pill>
            </div>
          </div>
        ))}
      </div>

      {modalTarget && (
        <GroupClassModal
          initial={modalTarget === "new" ? null : modalTarget}
          onClose={() => setModalTarget(null)}
          onSave={saveClass}
        />
      )}
    </div>
  );
}

function GroupClassModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [capacity, setCapacity] = useState(initial?.capacity ?? 10);

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), capacity: Math.max(1, Number(capacity) || 1) });
  }

  return (
    <Modal title={initial ? "Grup dersini düzenle" : "Yeni grup dersi"} onClose={onClose}>
      <Field label="Ders adı">
        <input
          autoFocus
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn. HIIT, High Rocks"
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </Field>
      <Field label="Maks kişi sayısı">
        <input
          type="number" min="1" style={styles.input}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </Field>
      <div style={styles.modalActions}>
        <button style={styles.secondaryBtn} onClick={onClose}>İptal</button>
        <button style={styles.primaryBtn} onClick={handleSave}>Kaydet</button>
      </div>
    </Modal>
  );
}

function TrainerScheduleModal({ trainer, sessions, customers, commissionRates, setCommissionRates, onClose }) {
  const [mode, setMode] = useState("week"); // 'day' | 'week'
  const [refDate, setRefDate] = useState(todayStr());
  const [earningsMonth, setEarningsMonth] = useState(currentMonthStr());

  const trainerSessions = sessions.filter((s) => s.ptId === trainer.id);

  let displaySessions, heading;
  if (mode === "day") {
    displaySessions = trainerSessions
      .filter((s) => s.date === refDate)
      .sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
    heading = fmtDateHeading(refDate);
  } else {
    const { start, end } = getWeekRange(refDate);
    displaySessions = trainerSessions
      .filter((s) => s.date >= start && s.date <= end)
      .sort((a, b) => (a.date === b.date ? timeToMin(a.startTime) - timeToMin(b.startTime) : a.date.localeCompare(b.date)));
    heading = `${start} – ${end}`;
  }

  function shiftDate(n) {
    setRefDate((d) => addDays(d, mode === "day" ? n : n * 7));
  }

  const grouped = mode === "week"
    ? displaySessions.reduce((acc, s) => {
        (acc[s.date] = acc[s.date] || []).push(s);
        return acc;
      }, {})
    : null;

  const { rows: earningsRows, total: earningsTotal } = computeTrainerEarnings(
    trainer.id, earningsMonth, sessions, customers, commissionRates
  );

  function updatePct(customerId, type, value) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    setCommissionRates((prev) => ({ ...prev, [commissionKey(trainer.id, customerId, type)]: pct }));
  }

  return (
    <Modal title={`${trainer.name} · Programı`} onClose={onClose} width={820}>
      <div style={styles.trainerModalCols}>
        <div style={styles.trainerModalColLeft}>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <button
              onClick={() => setMode("day")}
              style={{ ...styles.typeChip, borderColor: mode === "day" ? "var(--brand)" : "var(--border)", background: mode === "day" ? "rgba(0,0,0,0.06)" : "transparent" }}
            >
              Gün
            </button>
            <button
              onClick={() => setMode("week")}
              style={{ ...styles.typeChip, borderColor: mode === "week" ? "var(--brand)" : "var(--border)", background: mode === "week" ? "rgba(0,0,0,0.06)" : "transparent" }}
            >
              Hafta
            </button>
          </div>

          <div style={styles.dateNav}>
            <button style={styles.iconBtn} onClick={() => shiftDate(-1)}><ChevronLeft size={16} /></button>
            <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{heading}</div>
            <button style={styles.iconBtn} onClick={() => shiftDate(1)}><ChevronRight size={16} /></button>
            <button style={styles.linkBtn} onClick={() => setRefDate(todayStr())}>Bugün</button>
          </div>

          <div style={{ marginTop: 14 }}>
            {displaySessions.length === 0 && <EmptyState text="Bu aralıkta seans yok." />}

            {mode === "week" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {Object.keys(grouped).sort().map((dt) => (
                  <div key={dt}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                      {fmtDateHeading(dt)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {grouped[dt].map((s) => <TrainerSessionRow key={s.id} s={s} customers={customers} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {displaySessions.map((s) => <TrainerSessionRow key={s.id} s={s} customers={customers} />)}
              </div>
            )}
          </div>
        </div>

        <div style={styles.trainerModalCol}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Hakediş</div>
          <div style={styles.dateNav}>
            <button style={styles.iconBtn} onClick={() => setEarningsMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={16} /></button>
            <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1, textTransform: "capitalize" }}>{monthLabel(earningsMonth)}</div>
            <button style={styles.iconBtn} onClick={() => setEarningsMonth((m) => shiftMonth(m, 1))}><ChevronRight size={16} /></button>
            <button style={styles.linkBtn} onClick={() => setEarningsMonth(currentMonthStr())}>Bu ay</button>
          </div>

          {earningsRows.length === 0 && (
            <div style={{ marginTop: 14 }}><EmptyState text="Bu ay tamamlanan seans yok." /></div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {earningsRows.map((r) => (
              <div key={r.customer.id + r.type} style={styles.packageRow}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.customer.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                      {SESSION_TYPES[r.type].label} · {r.count} seans
                      {r.pkg?.price ? ` · ${r.pricePerSession.toFixed(0)} TL/seans` : " · paket ücreti girilmemiş"}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{r.payout.toFixed(0)} TL</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Antrenör payı:</span>
                  <input
                    type="number" min="0" max="100" style={{ ...styles.input, width: 64, padding: "5px 8px" }}
                    value={r.pct}
                    onChange={(e) => updatePct(r.customer.id, r.type, e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>%</span>
                </div>
              </div>
            ))}
          </div>

          {earningsRows.length > 0 && (
            <div style={styles.trainerEarningsTotal}>
              <span>Bu ay ödenecek toplam</span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{earningsTotal.toFixed(0)} TL</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TrainerSessionRow({ s, customers }) {
  const names = (s.customerIds || []).map((id) => customers.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
  return (
    <div style={styles.timelineRow}>
      <div style={{ ...styles.typeDot, background: SESSION_TYPES[s.type].color }} />
      <div style={{ width: 52, color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{s.startTime}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{sessionLabel(s)}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {SESSION_TYPES[s.type].zone === "upstairs" ? "Üst Kat" : "Alt Kat"}{names ? ` · ${names}` : ""}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.durationMin} dk</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   SHARED UI PRIMITIVES
------------------------------------------------------------------*/
function PageHeader({ eyebrow, title, action }) {
  return (
    <div style={styles.pageHeader}>
      <div>
        <div style={styles.eyebrow}>{eyebrow}</div>
        <h1 style={styles.pageTitle}>{title}</h1>
      </div>
      {action}
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div style={styles.card}>
      {title && <div style={styles.cardTitle}>{title}</div>}
      {children}
    </div>
  );
}
function EmptyState({ text }) {
  return <div style={styles.emptyState}>{text}</div>;
}
function Pill({ children, tone }) {
  const tones = {
    neutral: { bg: "var(--surface-2)", fg: "var(--muted)" },
    warn: { bg: "#FBF0DC", fg: "#95651A" },
    danger: { bg: "#FBE4E2", fg: "#A6332B" },
    ok: { bg: "#E1F0EA", fg: "#1F6F54" },
  };
  const t = tones[tone] || tones.neutral;
  return <span style={{ ...styles.pill, background: t.bg, color: t.fg }}>{children}</span>;
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}
function Modal({ title, onClose, children, width }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modalCard, ...(width ? { width } : {}) }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button style={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   STYLE TOKENS
------------------------------------------------------------------*/
const vars = {
  "--bg": "#F5F5F3",
  "--surface": "#FFFFFF",
  "--surface-2": "#EDEDEA",
  "--ink": "#161616",
  "--muted": "#6E6E68",
  "--border": "#E0E0DB",
  "--brand": "#171717",
  "--font-display": "'Oswald', 'Arial Narrow', sans-serif",
  "--font-body": "'Inter', system-ui, sans-serif",
};

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  input, select, button { font-family: var(--font-body); }
  input:focus, select:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
  button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
`;

const styles = {
  vars,
  app: {
    ...vars,
    display: "flex", minHeight: 640, background: "var(--bg)", color: "var(--ink)",
    fontFamily: "var(--font-body)", fontSize: 14, borderRadius: 12, overflow: "hidden",
  },
  sidebar: {
    width: 200, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column",
    padding: "20px 14px", flexShrink: 0,
  },
  brand: { display: "flex", alignItems: "center", marginBottom: 30, padding: "4px 4px 14px 4px", borderBottom: "1px solid rgba(255,255,255,0.12)" },
  brandLogo: { width: "100%", maxWidth: 168, height: "auto", display: "block" },
  nav: { display: "flex", flexDirection: "column", gap: 2, flex: 1 },
  navItem: {
    display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7,
    background: "transparent", border: "none", color: "rgba(255,255,255,0.65)", fontSize: 13.5,
    fontWeight: 500, cursor: "pointer", textAlign: "left",
  },
  navItemActive: { background: "rgba(255,255,255,0.1)", color: "#fff" },
  roleSwitch: { paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)" },
  backupSection: { paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", gap: 6 },
  backupBtn: {
    display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6,
    background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.8)",
    fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left",
  },
  roleLabel: { fontSize: 10.5, opacity: 0.5, marginBottom: 6, letterSpacing: 0.5 },
  roleToggle: { display: "flex", background: "rgba(255,255,255,0.08)", borderRadius: 7, padding: 2 },
  roleBtn: { flex: 1, padding: "6px 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 12, borderRadius: 5, cursor: "pointer" },
  roleBtnActive: { background: "var(--brand)", color: "#fff" },
  main: { flex: 1, padding: "26px 30px", overflowY: "auto" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  eyebrow: { fontSize: 11.5, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.6, marginBottom: 2, textTransform: "uppercase" },
  pageTitle: { fontFamily: "var(--font-display)", fontSize: 26, margin: 0, fontWeight: 600 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 22 },
  twoCol: { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 },
  statCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 },
  cardTitle: { fontWeight: 700, fontSize: 14, marginBottom: 14 },
  timelineRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--surface-2)" },
  typeDot: { width: 8, height: 8, borderRadius: 99, flexShrink: 0 },
  emptyState: { color: "var(--muted)", fontSize: 13, padding: "18px 0", textAlign: "center" },
  searchBar: { display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, maxWidth: 360 },
  memberSearchBar: { display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", marginBottom: 8 },
  searchInput: { border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13.5 },
  customerList: { display: "flex", flexDirection: "column", gap: 10 },
  customerCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" },
  customerMetaRow: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" },
  pill: { fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 99 },
  iconBtn: { width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink)" },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  secondaryBtnSm: { display: "flex", alignItems: "center", gap: 5, background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  primaryBtnSm: { display: "flex", alignItems: "center", gap: 5, background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  attendanceGroup: { borderBottom: "1px solid var(--surface-2)", paddingBottom: 12 },
  attendanceGroupHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  attendancePersonRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0 6px 16px" },
  linkBtn: { background: "transparent", border: "none", color: "var(--brand)", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  dateNav: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
  dateInput: { border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 13.5, background: "var(--surface)" },
  hourRuler: { position: "relative", height: 16, marginBottom: 4, marginLeft: 0 },
  laneLabel: { fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  zoneSectionLabel: { fontSize: 12, fontWeight: 800, color: "var(--ink)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid var(--border)" },
  laneLabelSm: { fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
  laneTrack: { position: "relative", height: 46, background: "var(--surface-2)", borderRadius: 8 },
  laneTrackSm: { position: "relative", height: 48, backgroundColor: "var(--surface-2)", borderRadius: 7, cursor: "pointer" },
  laneEmpty: { position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 12, fontSize: 11.5, color: "var(--muted)" },
  blockedOverlay: {
    position: "absolute", top: 2, bottom: 2, borderRadius: 5,
    background: "repeating-linear-gradient(135deg, rgba(0,0,0,0.09), rgba(0,0,0,0.09) 5px, rgba(0,0,0,0.02) 5px, rgba(0,0,0,0.02) 10px)",
    border: "1px dashed rgba(0,0,0,0.22)",
  },
  sessionBlock: { position: "absolute", top: 3, bottom: 3, borderRadius: 6, cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 8, paddingRight: 6 },
  sessionBlockLabel: { fontSize: 11.5, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  sessionBlockSubLabel: { fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 },
  legendRow: { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--surface-2)" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(20,25,22,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 },
  modalCard: { background: "var(--surface)", borderRadius: 12, width: 440, maxWidth: "calc(100vw - 40px)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid var(--border)" },
  modalTitle: { fontWeight: 700, fontSize: 15 },
  modalBody: { padding: 18 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  fieldRow: { display: "flex", gap: 12 },
  packageRow: { border: "1px solid var(--border)", borderRadius: 9, padding: 12, background: "var(--surface-2)" },
  trainerModalCols: { display: "flex" },
  trainerModalCol: { flex: 1, minWidth: 0 },
  trainerModalColLeft: { flex: 1, minWidth: 0, borderRight: "1px solid var(--border)", paddingRight: 22, marginRight: 22 },
  trainerEarningsTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "2px solid var(--border)" },
  sessionHistoryList: { maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, marginTop: 6, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 5 },
  input: { width: "100%", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 13.5, background: "var(--surface)" },
  typeSelectRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  typeChip: { border: "1.5px solid var(--border)", borderRadius: 7, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: "transparent" },
  customerPickList: { maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 7, padding: 8, display: "flex", flexDirection: "column", gap: 4 },
  customerPickRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 2px", cursor: "pointer" },
  errorBox: { background: "#FBE4E2", color: "#A6332B", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  paymentsTable: { display: "flex", flexDirection: "column", gap: 8 },
  paymentRow: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" },
};
