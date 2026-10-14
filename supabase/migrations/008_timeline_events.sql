-- ============================================================
-- Migration 008: editable homepage timeline
--
-- Run in the Supabase SQL Editor. Idempotent.
--
-- The "Upcoming Events" timeline on index.html used to be hardcoded.
-- Admins now edit it from admin.html -> Homepage Timeline. The homepage
-- is public, so anyone can read these rows; only admins can change them.
-- ============================================================
begin;

create table if not exists public.timeline_events (
  id          uuid        primary key default gen_random_uuid(),
  tag         text        not null default '',      -- small label above the title
  title       text        not null,
  description text        not null default '',
  event_date  date,
  created_at  timestamptz not null default now()
);

comment on table public.timeline_events is
  'Entries in the homepage "Upcoming Events" timeline.';

alter table public.timeline_events enable row level security;

drop policy if exists "timeline_select_public" on public.timeline_events;
drop policy if exists "timeline_insert_admin"  on public.timeline_events;
drop policy if exists "timeline_update_admin"  on public.timeline_events;
drop policy if exists "timeline_delete_admin"  on public.timeline_events;

create policy "timeline_select_public" on public.timeline_events
  for select using (true);
create policy "timeline_insert_admin"  on public.timeline_events
  for insert with check (public.is_admin());
create policy "timeline_update_admin"  on public.timeline_events
  for update using (public.is_admin());
create policy "timeline_delete_admin"  on public.timeline_events
  for delete using (public.is_admin());

-- Seed with what the homepage showed before, only on the first run.
insert into public.timeline_events (tag, title, description, event_date)
select * from (values
  ('Interest Meeting', 'Interest Meeting',
   'New to FBLA? Start here. Find out what the chapter does, how competitive events work, and how to get involved this year.',
   date '2026-08-27'),
  ('Social Event', 'Fusion Boba Social',
   'Kick off the year with the chapter over boba. Meet the officer team and other members before the season gets busy.',
   date '2026-08-28'),
  ('Chapter Meeting', 'Chapter Meeting',
   'Our first full chapter meeting of the year — chapter updates, upcoming events, and what to expect from the season ahead.',
   date '2026-09-10')
) as seed(tag, title, description, event_date)
where not exists (select 1 from public.timeline_events);

commit;
