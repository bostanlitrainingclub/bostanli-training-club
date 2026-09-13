-- Bostanlı Training Club — database schema
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run

-- ============================================================
-- STAFF (trainers) — each row can be linked to a real login.
-- IDs are plain text (matching the app's own id generator), except
-- auth_user_id which is a uuid because that's Supabase Auth's own type.
-- ============================================================
create table if not exists staff (
  id text primary key,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null default 'pt' check (role in ('owner', 'pt')),
  color text,
  preferred_pt_row int,
  availability jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- CUSTOMERS (members)
-- ============================================================
create table if not exists customers (
  id text primary key,
  name text not null,
  phone text,
  email text,
  tc_no text,
  membership_form_done boolean default false,
  balance numeric default 0,
  notes text,
  packages jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- SESSIONS (the floor schedule)
-- ============================================================
create table if not exists sessions (
  id text primary key,
  type text not null check (type in ('pt', 'private', 'group', 'pilates')),
  date date not null,
  start_time text not null,
  duration_min int not null,
  pt_id text references staff(id) on delete set null,
  customer_ids text[] default '{}',
  customer_names text,
  group_class_id text,
  group_class_name text,
  attendance jsonb default '{}'::jsonb,
  reviewed boolean default false,
  slot int,
  created_at timestamptz default now()
);
create index if not exists sessions_date_idx on sessions(date);

-- ============================================================
-- GROUP CLASSES (the class catalog — HIIT, High Rocks, etc.)
-- ============================================================
create table if not exists group_classes (
  id text primary key,
  name text not null,
  capacity int not null default 10,
  created_at timestamptz default now()
);

-- ============================================================
-- COMMISSION RATES — keyed by trainer + member + session type
-- ============================================================
create table if not exists commission_rates (
  pt_id text references staff(id) on delete cascade,
  customer_id text references customers(id) on delete cascade,
  session_type text not null,
  percent numeric not null default 50,
  primary key (pt_id, customer_id, session_type)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Anyone logged in (any staff account) can read everything — the floor
-- schedule and member list are shared. Only Admins can write to the
-- sensitive tables (customers, group_classes, commission_rates, staff).
-- PTs can write to sessions, restricted to their own (pt_id = their own
-- staff row) — this is what enforces "PTs can only edit their own
-- schedule" at the database level, not just in the app's UI.
-- ============================================================

alter table staff enable row level security;
alter table customers enable row level security;
alter table sessions enable row level security;
alter table group_classes enable row level security;
alter table commission_rates enable row level security;

-- Helper: is the current logged-in user an Admin?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from staff
    where auth_user_id = auth.uid() and role = 'owner'
  );
$$ language sql security definer stable;

-- Helper: this user's own staff.id (used to restrict PTs to their own sessions)
create or replace function my_staff_id()
returns text as $$
  select id from staff where auth_user_id = auth.uid() limit 1;
$$ language sql security definer stable;

-- STAFF: everyone logged in can read; only Admins can write
create policy "staff_read_all" on staff for select using (auth.uid() is not null);
create policy "staff_write_admin" on staff for all using (is_admin()) with check (is_admin());

-- CUSTOMERS: everyone logged in can read; only Admins can write
create policy "customers_read_all" on customers for select using (auth.uid() is not null);
create policy "customers_write_admin" on customers for all using (is_admin()) with check (is_admin());

-- SESSIONS: everyone can read (full floor visibility); Admins can write anything;
-- PTs can only create/update/delete sessions where they are the assigned trainer.
create policy "sessions_read_all" on sessions for select using (auth.uid() is not null);
create policy "sessions_write_admin" on sessions for all using (is_admin()) with check (is_admin());
create policy "sessions_write_own" on sessions for all
  using (pt_id = my_staff_id())
  with check (pt_id = my_staff_id());

-- GROUP CLASSES: everyone reads (needed to book), only Admins manage the catalog
create policy "group_classes_read_all" on group_classes for select using (auth.uid() is not null);
create policy "group_classes_write_admin" on group_classes for all using (is_admin()) with check (is_admin());

-- COMMISSION RATES: Admin-only, both read and write (pay rates are sensitive)
create policy "commission_rates_admin_only" on commission_rates for all using (is_admin()) with check (is_admin());
