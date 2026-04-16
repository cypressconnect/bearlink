-- ============================================================
-- Bear Link – Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Members ─────────────────────────────────────────────────
create table public.members (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  email         text        unique,
  grade         int         check (grade between 9 and 12),
  student_id    text        unique,
  total_points  int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.members is 'FBLA chapter members and their cumulative point totals.';

-- Keep updated_at current automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_updated_at
  before update on public.members
  for each row execute procedure public.set_updated_at();

-- ── Events ──────────────────────────────────────────────────
create table public.events (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  point_value  int         not null default 0,
  category     text        not null default 'Meeting'
                           check (category in ('Competition','Social','Meeting','Fundraiser','Education','Volunteer')),
  event_date   date,
  created_at   timestamptz not null default now()
);
comment on table public.events is 'FBLA events that carry point values.';

-- ── Point Assignments ────────────────────────────────────────
-- One row per member per event (prevents double-awarding).
create table public.point_assignments (
  id              uuid        primary key default gen_random_uuid(),
  member_id       uuid        not null references public.members(id)  on delete cascade,
  event_id        uuid        not null references public.events(id)   on delete cascade,
  points_awarded  int         not null,
  assigned_at     timestamptz not null default now(),
  unique (member_id, event_id)
);
comment on table public.point_assignments is 'Log of which members earned points for which events.';

-- Recalculate total_points on members whenever assignments change
create or replace function public.sync_member_points()
returns trigger language plpgsql security definer as $$
declare
  affected_member_id uuid;
begin
  affected_member_id := coalesce(new.member_id, old.member_id);
  update public.members
  set total_points = (
    select coalesce(sum(points_awarded), 0)
    from public.point_assignments
    where member_id = affected_member_id
  )
  where id = affected_member_id;
  return null;
end;
$$;

create trigger recalc_points_on_insert
  after insert on public.point_assignments
  for each row execute procedure public.sync_member_points();

create trigger recalc_points_on_delete
  after delete on public.point_assignments
  for each row execute procedure public.sync_member_points();

create trigger recalc_points_on_update
  after update on public.point_assignments
  for each row execute procedure public.sync_member_points();

-- ── Admin Profiles ───────────────────────────────────────────
-- Extends auth.users; only admins have a row here.
create table public.admin_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);
comment on table public.admin_profiles is 'Marks which auth.users are admins.';

-- ── Row Level Security ───────────────────────────────────────

alter table public.members           enable row level security;
alter table public.events            enable row level security;
alter table public.point_assignments enable row level security;
alter table public.admin_profiles    enable row level security;

-- Helper: returns true if the calling user has an admin_profiles row
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid()
  );
$$;

-- members: anyone can read, only admins can write
create policy "members_select_public"  on public.members for select using (true);
create policy "members_insert_admin"   on public.members for insert with check (public.is_admin());
create policy "members_update_admin"   on public.members for update using (public.is_admin());
create policy "members_delete_admin"   on public.members for delete using (public.is_admin());

-- events: anyone can read, only admins can write
create policy "events_select_public"   on public.events for select using (true);
create policy "events_insert_admin"    on public.events for insert with check (public.is_admin());
create policy "events_update_admin"    on public.events for update using (public.is_admin());
create policy "events_delete_admin"    on public.events for delete using (public.is_admin());

-- point_assignments: anyone can read, only admins can write
create policy "pa_select_public"       on public.point_assignments for select using (true);
create policy "pa_insert_admin"        on public.point_assignments for insert with check (public.is_admin());
create policy "pa_update_admin"        on public.point_assignments for update using (public.is_admin());
create policy "pa_delete_admin"        on public.point_assignments for delete using (public.is_admin());

-- admin_profiles: only the admin themselves can read their own row
create policy "ap_select_own"          on public.admin_profiles for select using (id = auth.uid());

-- ── Sample Seed Data ─────────────────────────────────────────
-- (Optional – uncomment to populate with demo data)

/*
insert into public.members (name, email, grade, student_id) values
  ('Sarah Jenkins',  'sarah.j@bridgeland.fbla',  12, '22001'),
  ('Ethan Rivers',   'ethan.r@bridgeland.fbla',  11, '22002'),
  ('Marcus Thorne',  'marcus.t@bridgeland.fbla',  11, '22003'),
  ('Aria Vance',     'aria.v@bridgeland.fbla',    12, '22004'),
  ('Leo Zheng',      'leo.z@bridgeland.fbla',     11, '22005'),
  ('Chloe Dupont',   'chloe.d@bridgeland.fbla',    9, '22006'),
  ('Julian Brooks',  'julian.b@bridgeland.fbla',  10, '22007');

insert into public.events (name, point_value, category, event_date) values
  ('District Leadership Conference',      450, 'Competition', '2024-01-15'),
  ('Winter Mixer & Networking',           100, 'Social',      '2023-12-08'),
  ('Resume Building Workshop',            200, 'Education',   '2023-10-14'),
  ('March for Dimes Charity Run',         150, 'Volunteer',   '2025-02-12'),
  ('Spring Business Leadership Workshop',  50, 'Education',   '2024-03-20');
*/
