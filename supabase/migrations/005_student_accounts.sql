-- ============================================================
-- Migration 005: student accounts
--
-- Run in the Supabase SQL Editor. Idempotent.
--
-- Adds a second kind of login. Admins keep their existing accounts and
-- powers; students get read access to the whole site once signed in, and
-- signed-out visitors can see the homepage only.
--
-- Access is enforced in the database, not just in the pages -- otherwise
-- anyone could read the roster straight from the REST API with the public
-- anon key, which is exactly what happens today.
-- ============================================================

begin;

-- ── 1. Student profiles ──────────────────────────────────────
create table if not exists public.student_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text not null unique,
  member_id  uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.student_profiles is
  'One row per student login. Admins are in admin_profiles instead.';

-- A CFISD student address: 4 letters, 4 digits, @stu.cfisd.net
-- e.g. abcd1234@stu.cfisd.net
alter table public.student_profiles
  drop constraint if exists student_profiles_school_email;
alter table public.student_profiles
  add constraint student_profiles_school_email
  check (email ~* '^[a-z]{4}[0-9]{4}@stu\.cfisd\.net$');

-- ── 2. Create the profile automatically on sign-up ───────────
-- Doing this in a trigger means the row exists no matter how the account
-- was made, and the client never needs write access to the table.
--
-- Accounts whose address is not a student address (an admin's gmail, say)
-- simply get no student profile. They are not rejected, because the same
-- trigger fires for admin accounts created from the dashboard.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email ~* '^[a-z]{4}[0-9]{4}@stu\.cfisd\.net$' then
    insert into public.student_profiles (id, full_name, email)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
      lower(new.email)
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 3. Who counts as signed in ───────────────────────────────
-- A student profile or an admin profile. A bare auth user with neither
-- (someone who signed up through the API with a random address) gets
-- nothing.
create or replace function public.is_chapter_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.student_profiles where id = auth.uid())
      or exists (select 1 from public.admin_profiles   where id = auth.uid());
$$;

revoke all on function public.is_chapter_user() from public;
grant execute on function public.is_chapter_user() to anon, authenticated, service_role;

-- ── 4. Lock reads to signed-in chapter users ─────────────────
-- These were `using (true)`: the roster, every event and every point was
-- readable by anyone with the anon key, which ships in the page source.
drop policy if exists "members_select_public"  on public.members;
drop policy if exists "events_select_public"   on public.events;
drop policy if exists "pa_select_public"       on public.point_assignments;

drop policy if exists "members_select_chapter" on public.members;
drop policy if exists "events_select_chapter"  on public.events;
drop policy if exists "pa_select_chapter"      on public.point_assignments;

create policy "members_select_chapter" on public.members
  for select using (public.is_chapter_user());
create policy "events_select_chapter" on public.events
  for select using (public.is_chapter_user());
create policy "pa_select_chapter" on public.point_assignments
  for select using (public.is_chapter_user());

-- ── 5. Student profile policies ──────────────────────────────
alter table public.student_profiles enable row level security;

drop policy if exists "sp_select_own"    on public.student_profiles;
drop policy if exists "sp_update_own"    on public.student_profiles;
drop policy if exists "sp_select_admin"  on public.student_profiles;
drop policy if exists "sp_delete_admin"  on public.student_profiles;

-- A student can read and rename themselves.
create policy "sp_select_own" on public.student_profiles
  for select using (id = auth.uid());
create policy "sp_update_own" on public.student_profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Admins can see and remove student accounts.
create policy "sp_select_admin" on public.student_profiles
  for select using (public.is_admin());
create policy "sp_delete_admin" on public.student_profiles
  for delete using (public.is_admin());

-- ── 6. Let a signed-in user check their own admin status ─────
-- ap_select_own already covers this, but be explicit: without it the
-- admin pages cannot tell an admin from a student.
drop policy if exists "ap_select_own" on public.admin_profiles;
create policy "ap_select_own" on public.admin_profiles
  for select using (id = auth.uid());

-- ── 7. Link students to their member record where possible ───
-- Best-effort match on name. Unmatched students still get full read
-- access; this only powers "my points" style features later.
update public.student_profiles sp
set    member_id = m.id
from   public.members m
where  sp.member_id is null
  and  lower(btrim(m.name)) = lower(btrim(sp.full_name));

commit;

-- ── Verification ─────────────────────────────────────────────
-- Signed out, this should return no rows (run it from an incognito
-- window's console, or with curl and the anon key):
--   select * from public.members limit 1;
--
-- Admin count, student count:
--   select (select count(*) from public.admin_profiles)   as admins,
--          (select count(*) from public.student_profiles) as students;
