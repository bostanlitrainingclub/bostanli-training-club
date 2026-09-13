// This file is the bridge between the app's existing data shapes (camelCase,
// exactly what the ported UI components already expect) and Postgres's
// snake_case columns. Nothing in components/GymApp.jsx needs to know Postgres
// exists — it just reads/writes the same plain objects it always did.

export function customerFromRow(r) {
  return {
    id: r.id, name: r.name, phone: r.phone || "", email: r.email || "",
    tcNo: r.tc_no || null, membershipFormDone: !!r.membership_form_done,
    balance: Number(r.balance) || 0, notes: r.notes || "",
    packages: r.packages || [],
  };
}
export function customerToRow(c) {
  return {
    id: c.id, name: c.name, phone: c.phone || null, email: c.email || null,
    tc_no: c.tcNo || null, membership_form_done: !!c.membershipFormDone,
    balance: c.balance || 0, notes: c.notes || null, packages: c.packages || [],
  };
}

export function staffFromRow(r) {
  return {
    id: r.id, name: r.name, color: r.color || null,
    preferredPtRow: r.preferred_pt_row ?? null,
    availability: r.availability || undefined,
    _authUserId: r.auth_user_id || null, _dbRole: r.role,
  };
}
export function staffToRow(s, roleForRow) {
  return {
    id: s.id, name: s.name, color: s.color || null,
    preferred_pt_row: s.preferredPtRow ?? null,
    availability: s.availability || {},
    role: roleForRow || s._dbRole || "pt",
  };
}

export function sessionFromRow(r) {
  return {
    id: r.id, type: r.type, date: r.date, startTime: r.start_time,
    durationMin: r.duration_min, ptId: r.pt_id || null,
    customerIds: r.customer_ids || [], customerNames: r.customer_names || "",
    groupClassId: r.group_class_id || null, groupClassName: r.group_class_name || null,
    attendance: r.attendance || {}, reviewed: !!r.reviewed, slot: r.slot ?? null,
  };
}
export function sessionToRow(s) {
  return {
    id: s.id, type: s.type, date: s.date, start_time: s.startTime,
    duration_min: s.durationMin, pt_id: s.ptId || null,
    customer_ids: s.customerIds || [], customer_names: s.customerNames || null,
    group_class_id: s.groupClassId || null, group_class_name: s.groupClassName || null,
    attendance: s.attendance || {}, reviewed: !!s.reviewed, slot: s.slot ?? null,
  };
}

export function groupClassFromRow(r) {
  return { id: r.id, name: r.name, capacity: r.capacity };
}
export function groupClassToRow(g) {
  return { id: g.id, name: g.name, capacity: g.capacity };
}

// commissionRates is a flat { "ptId::customerId::type": percent } object in the
// app; the table stores one row per key instead.
export function commissionRatesFromRows(rows) {
  const out = {};
  rows.forEach((r) => { out[`${r.pt_id}::${r.customer_id}::${r.session_type}`] = Number(r.percent); });
  return out;
}
export function commissionRateToRow(key, percent) {
  const [pt_id, customer_id, session_type] = key.split("::");
  return { pt_id, customer_id, session_type, percent };
}

// --- Initial load: pull every table once when the app opens ---
export async function loadAll(supabase) {
  const [customersRes, staffRes, sessionsRes, groupClassesRes, commissionRes] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("staff").select("*"),
    supabase.from("sessions").select("*"),
    supabase.from("group_classes").select("*"),
    supabase.from("commission_rates").select("*"),
  ]);
  for (const res of [customersRes, staffRes, sessionsRes, groupClassesRes, commissionRes]) {
    if (res.error) throw res.error;
  }
  return {
    customers: customersRes.data.map(customerFromRow),
    staff: staffRes.data.map(staffFromRow),
    sessions: sessionsRes.data.map(sessionFromRow),
    groupClasses: groupClassesRes.data.map(groupClassFromRow),
    commissionRates: commissionRatesFromRows(commissionRes.data),
  };
}

// --- Generic sync: upsert everything currently in state, delete anything removed ---
// This mirrors the app's original "save on every state change" pattern, just
// writing real rows instead of one JSON blob.
export async function syncTable(supabase, table, prevArr, nextArr, toRow) {
  const prevIds = new Set(prevArr.map((x) => x.id));
  const nextIds = new Set(nextArr.map((x) => x.id));
  const toDelete = [...prevIds].filter((id) => !nextIds.has(id));
  const rows = nextArr.map(toRow);
  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) console.error(`Sync error writing ${table}:`, error);
  }
  if (toDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) console.error(`Sync error deleting from ${table}:`, error);
  }
}

// Commission rates don't have a single `id` — sync by composite key instead.
export async function syncCommissionRates(supabase, prevRates, nextRates) {
  const prevKeys = new Set(Object.keys(prevRates || {}));
  const nextKeys = new Set(Object.keys(nextRates || {}));
  const toDelete = [...prevKeys].filter((k) => !nextKeys.has(k));
  const toUpsert = [...nextKeys]
    .filter((k) => prevRates?.[k] !== nextRates[k])
    .map((k) => commissionRateToRow(k, nextRates[k]));
  if (toUpsert.length > 0) {
    const { error } = await supabase.from("commission_rates").upsert(toUpsert);
    if (error) console.error("Sync error writing commission_rates:", error);
  }
  for (const k of toDelete) {
    const [pt_id, customer_id, session_type] = k.split("::");
    const { error } = await supabase.from("commission_rates").delete()
      .match({ pt_id, customer_id, session_type });
    if (error) console.error("Sync error deleting commission_rates:", error);
  }
}
