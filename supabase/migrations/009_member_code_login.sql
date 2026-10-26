-- ============================================================
-- Migration 009: code login for members and admins
--
-- Run in the Supabase SQL Editor. Idempotent.
--
-- BEFORE RUNNING: Dashboard -> Authentication -> Sign In / Providers ->
-- turn ON "Allow anonymous sign-ins". The code login depends on it.
--
-- Nobody makes an account any more. Members type the member code
-- (FBLA2627), officers type the admin code (fblaadmin). Either way they
-- get a throwaway anonymous session -- no name, no email, nothing stored
-- about them.
--
-- How it works:
--   1. The page calls supabase.auth.signInAnonymously().
--   2. It then calls redeem_member_code() or redeem_admin_code() with
--      what they typed.
--   3. Member code right -> that anonymous user goes in code_sessions,
--      along with the code they used. is_chapter_user() only counts it
--      while that code is still the current one.
--      Admin code right -> that anonymous user gets an admin_profiles row
--      marked via_code. Everything that already checks admin_profiles
--      (RLS, the sync-to-sheets edge function) just works.
--   4. Changing a code (admin.html -> Login Codes) signs everyone who used
--      the old one out. Do it at the start of each year.
--
-- The codes are never readable by members or signed-out visitors. Only
-- the redeem functions (and admins) can see them.
-- ============================================================

begin;

-- ── 1. The current codes (one row) ───────────────────────────
create table if not exists public.access_codes (
  id          boolean     primary key default true check (id),   -- forces a single row
  member_code text        not null check (length(btrim(member_code)) >= 4),
  admin_code  text        not null check (length(btrim(admin_code))  >= 4),
  updated_at  timestamptz not null default now(),
  check (upper(btrim(member_code)) <> upper(btrim(admin_code)))
);

comment on table public.access_codes is
  'The codes members and admins type to sign in. Admins change them from admin.html.';

insert into public.access_codes (id, member_code, admin_code)
values (true, 'FBLA2627', 'fblaadmin')
on conflict (id) do nothing;

alter table public.access_codes enable row level security;

drop policy if exists "ac_select_admin" on public.access_codes;
drop policy if exists "ac_update_admin" on public.access_codes;

create policy "ac_select_admin" on public.access_codes
  for select using (public.is_admin());
create policy "ac_update_admin" on public.access_codes
  for update using (public.is_admin()) with check (public.is_admin());

-- ── 2. Members: who got in with which code ───────────────────
-- Only an anonymous user id and the code they typed. No personal data.
create table if not exists public.code_sessions (
  id         uuid        primary key references auth.users(id) on delete cascade,
  code       text        not null,
  created_at timestamptz not null default now()
);

comment on table public.code_sessions is
  'Anonymous logins that entered the member code. Holds no personal data.';

-- No policies: nobody reads or writes this directly. Only the
-- security-definer functions below touch it.
alter table public.code_sessions enable row level security;

-- ── 3. Admins: mark rows that came from the admin code ───────
alter table public.admin_profiles
  add column if not exists via_code boolean not null default false;

-- ── 4. Check a code ──────────────────────────────────────────
-- Case and surrounding spaces do not matter, so "fbla2627 " works.
create or replace function public.redeem_member_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_code text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select member_code into current_code from public.access_codes where id;

  if current_code is null
     or upper(btrim(coalesce(p_code, ''))) <> upper(btrim(current_code)) then
    return false;
  end if;

  insert into public.code_sessions (id, code)
  values (auth.uid(), current_code)
  on conflict (id) do update set code = excluded.code, created_at = now();

  return true;
end;
$$;

create or replace function public.redeem_admin_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_code text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select admin_code into current_code from public.access_codes where id;

  if current_code is null
     or upper(btrim(coalesce(p_code, ''))) <> upper(btrim(current_code)) then
    return false;
  end if;

  insert into public.admin_profiles (id, name, via_code)
  values (auth.uid(), 'Admin', true)
  on conflict (id) do nothing;

  return true;
end;
$$;

revoke all on function public.redeem_member_code(text) from public;
revoke all on function public.redeem_admin_code(text)  from public;
grant execute on function public.redeem_member_code(text) to authenticated;
grant execute on function public.redeem_admin_code(text)  to authenticated;

-- ── 5. Changing the admin code signs out the other code admins ─
-- The admin making the change keeps access, so they are not locked out
-- of the page they are standing on.
create or replace function public.revoke_code_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(btrim(new.admin_code)) <> upper(btrim(old.admin_code)) then
    delete from public.admin_profiles
    where  via_code and id is distinct from auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists on_admin_code_change on public.access_codes;
create trigger on_admin_code_change
  after update on public.access_codes
  for each row execute procedure public.revoke_code_admins();

-- ── 6. Who counts as signed in ───────────────────────────────
-- Admins, or a code session whose code is still the current one.
-- Student accounts from migration 005 no longer count.
create or replace function public.is_chapter_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admin_profiles where id = auth.uid())
      or exists (
           select 1
           from   public.code_sessions cs
           join   public.access_codes ac on ac.id
           where  cs.id = auth.uid()
             and  cs.code = ac.member_code
         );
$$;

revoke all on function public.is_chapter_user() from public;
grant execute on function public.is_chapter_user() to anon, authenticated, service_role;

-- ── 7. Stop creating student profiles on sign-up ─────────────
drop trigger if exists on_auth_user_created on auth.users;

commit;

-- ── Optional: delete the old student accounts ────────────────
-- Not run automatically because it cannot be undone. Once you are happy
-- the code login works, run this to remove every student's name and
-- email from the database:
--
--   begin;
--   delete from auth.users where id in (select id from public.student_profiles);
--   drop table if exists public.student_profiles;
--   drop function if exists public.handle_new_user();
--   commit;
--
-- ── Optional: clear out stale anonymous logins ───────────────
-- Every code login leaves an anonymous user behind. Harmless, but to
-- tidy up the ones that are older than a year:
--
--   delete from auth.users
--   where  is_anonymous and created_at < now() - interval '1 year';

-- ── Verification ─────────────────────────────────────────────
--   select member_code, admin_code, updated_at from public.access_codes;
--   select count(*) from public.code_sessions;
--   select count(*) from public.admin_profiles where via_code;
