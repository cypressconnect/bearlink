-- ============================================================
-- Migration 002: Repair the events table + harden the sync layer
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- It is idempotent: safe to run more than once.
--
-- What it fixes (found by auditing the live DB on 2026-08-15):
--   * 39 orphan "events" that are really spreadsheet formula /
--     subtotal columns ("Attendance Formula", "# of Socials
--     Participated In", "|", ...) that got imported as real events
--   * 14 duplicate "SilverCrest" events + 5 duplicate meeting events
--     (nothing stopped the website from inserting the same event twice)
--   * categories the app writes ("Attendance - General") that the
--     CHECK constraint never allowed
--   * point_value out of sync with what the sheet actually awards
--     (Conferences award 12, Everfi 18, Capstone 20 -- all stored as 6)
--   * total_points drifting away from the sum of the assignments
-- ============================================================

begin;

-- ── 1. Canonical category list ───────────────────────────────
-- 'Committee' is new; the sheet has a committee-meetings tab that
-- was never synced at all.
alter table public.events drop constraint if exists events_category_check;

-- Fold the invalid split-attendance categories back into 'Attendance'.
-- The event NAME already distinguishes General vs Officer meetings.
update public.events
set category = 'Attendance'
where category in ('Attendance - General', 'Attendance - Officer');

-- Legacy category names from the original schema.
update public.events set category = 'Attendance'  where category = 'Meeting';
update public.events set category = 'Service'     where category in ('Volunteer', 'Education');
update public.events set category = 'Fundraising' where category = 'Fundraiser';
update public.events set category = 'Conference'  where category = 'Competition';

alter table public.events
  add constraint events_category_check
  check (category in (
    'Attendance',     -- general & officer meetings
    'Social',         -- socials
    'Service',        -- service / volunteer events
    'Fundraising',    -- fundraisers
    'Conference',     -- conferences & competitions
    'BAA',            -- Business Achievement Awards
    'Committee',      -- committee meetings
    'Miscellaneous',  -- one-off point columns on "Points in General"
    'Other'           -- catch-all
  ));

-- ── 2. Delete spreadsheet artifacts that are not real events ─
-- These are formula columns, subtotal columns and separators that
-- the importer scraped. Only delete rows that carry NO points, so
-- this can never destroy someone's earned points.
delete from public.events e
where not exists (
        select 1 from public.point_assignments pa where pa.event_id = e.id
      )
  and (
        -- subtotal / rollup columns
        e.name ~* '^(total|sum|#|points\s+for)'
        -- formula helper columns
     or e.name ~* 'formula$'
        -- multiplier columns from "Points in General"
     or e.name ~* '\((x)?[0-9]+x?\)$'
        -- column separators and blanks
     or btrim(e.name) in ('|', '\', '')
        -- specific known-bad rows found in the audit
     or e.name in (
          'Remind',
          'Fundraising Points',
          'Service Project - Points',
          'Attendance (x2)',
          'Conference (12x)',
          'BAAs (6x)'
        )
        -- an event whose name is just its own category ("Social" in Social)
     or lower(btrim(e.name)) = lower(e.category)
  );

-- Miscategorised copies: the same event name filed under a second category
-- with nothing awarded, while the real one has points.
-- ("SilverCrest" ended up in Attendance as well as Service.)
delete from public.events e
where not exists (
        select 1 from public.point_assignments pa where pa.event_id = e.id
      )
  and exists (
        select 1
        from public.events other
        join public.point_assignments pa on pa.event_id = other.id
        where lower(btrim(other.name)) = lower(btrim(e.name))
          and other.category <> e.category
      );

-- ── 3. Merge duplicate events ────────────────────────────────
-- Keeps the oldest row for each (lower(name), category), moves any
-- assignments onto it, then deletes the extras.
with ranked as (
  select id,
         first_value(id) over (
           partition by lower(btrim(name)), category
           order by created_at, id
         ) as keep_id
  from public.events
)
update public.point_assignments pa
set    event_id = r.keep_id
from   ranked r
where  pa.event_id = r.id
  and  r.keep_id <> r.id
  -- skip rows that would collide with an assignment already on keep_id
  and  not exists (
         select 1 from public.point_assignments x
         where x.member_id = pa.member_id and x.event_id = r.keep_id
       );

-- Any assignment that WOULD have collided is a genuine duplicate: drop it.
delete from public.point_assignments pa
using public.events e, public.events keep
where pa.event_id = e.id
  and keep.id <> e.id
  and lower(btrim(keep.name)) = lower(btrim(e.name))
  and keep.category = e.category
  and (keep.created_at, keep.id) < (e.created_at, e.id);

-- Now the duplicate event rows are empty -- remove them.
delete from public.events e
using public.events keep
where keep.id <> e.id
  and lower(btrim(keep.name)) = lower(btrim(e.name))
  and keep.category = e.category
  and (keep.created_at, keep.id) < (e.created_at, e.id);

-- ── 4. Stop duplicates from ever coming back ─────────────────
create unique index if not exists events_name_category_uniq
  on public.events (lower(btrim(name)), category);

-- ── 5. Fix point values that disagree with the sheet ─────────
update public.events set point_value = 12 where category = 'Conference'  and point_value <> 12;
update public.events set point_value = 2  where category = 'Attendance'  and point_value <> 2;
update public.events set point_value = 18 where name = 'Everfi Alternative BAA';
update public.events set point_value = 20 where name = 'Capstone Project';
update public.events set point_value = 6
  where category = 'BAA'
    and name not in ('Everfi Alternative BAA', 'Capstone Project')
    and point_value <> 6;

-- Typo in the sheet column header, carried into the DB.
update public.events
set    name = 'State Conference (February 2026)'
where  name = 'State Conference (Febyuary 2026)'
  and  not exists (
        select 1 from public.events e2
        where lower(btrim(e2.name)) = 'state conference (february 2026)'
          and e2.category = 'Conference'
      );

-- ── 6. Event dates ───────────────────────────────────────────
-- Every event currently has event_date = null because the create-event
-- form never collected one. Backfill from the M/D in the event name
-- (e.g. "Silvercrest 10/17", "8/29 Boba Social") using the 2025-26
-- school year: Aug-Dec -> 2025, Jan-Jul -> 2026.
-- to_date (not make_date) so an impossible date like 2/30 rolls over
-- instead of aborting the whole migration.
update public.events e
set event_date = to_date(
      (case when split_part(m[1], '/', 1)::int >= 8 then '2025-' else '2026-' end)
      || split_part(m[1], '/', 1) || '-' || split_part(m[1], '/', 2),
      'YYYY-MM-DD'
    )
from (
  select id, regexp_match(name, '([0-9]{1,2}/[0-9]{1,2})') as m
  from public.events
  where event_date is null
) src
where e.id = src.id
  and src.m is not null
  and split_part(src.m[1], '/', 1)::int between 1 and 12
  and split_part(src.m[1], '/', 2)::int between 1 and 31;

-- ── 7. Track where each event lives in the spreadsheet ───────
-- Lets the sync layer find an event's column even after someone
-- renames it in the sheet or on the site.
alter table public.events
  add column if not exists sheet_tab    text,
  add column if not exists sheet_header text;

update public.events
set sheet_header = coalesce(sheet_header, name),
    sheet_tab    = coalesce(sheet_tab, case category
                     when 'Service'       then 'Services'
                     when 'Fundraising'   then 'Fundraising'
                     when 'Social'        then 'Social'
                     when 'Conference'    then 'Conferences'
                     when 'BAA'           then 'BAA'
                     when 'Attendance'    then 'Attendance'
                     when 'Committee'     then 'Committee Meetings'
                     else 'Points in General'
                   end)
where sheet_tab is null or sheet_header is null;

-- ── 8. Guard rails on point_assignments ──────────────────────
alter table public.point_assignments
  drop constraint if exists point_assignments_points_nonneg;
alter table public.point_assignments
  add constraint point_assignments_points_nonneg check (points_awarded >= 0);

-- A 0-point assignment means "not awarded" -- it should not exist.
delete from public.point_assignments where points_awarded = 0;

-- ── 9. Recalculate every member's total from scratch ─────────
update public.members m
set total_points = coalesce((
      select sum(pa.points_awarded)
      from public.point_assignments pa
      where pa.member_id = m.id
    ), 0);

-- ── 10. One-shot total rebuild, callable from the sync layer ─
create or replace function public.recalc_all_member_totals()
returns void
language sql
security definer
set search_path = public
as $$
  update public.members m
  set total_points = coalesce((
        select sum(pa.points_awarded)
        from public.point_assignments pa
        where pa.member_id = m.id
      ), 0)
  where m.total_points is distinct from coalesce((
        select sum(pa.points_awarded)
        from public.point_assignments pa
        where pa.member_id = m.id
      ), 0);
$$;

revoke all on function public.recalc_all_member_totals() from public, anon;
grant execute on function public.recalc_all_member_totals() to service_role, authenticated;

-- ── 11. Helper view: what the leaderboard should say ─────────
-- Used by the site so the ranking is computed in one place.
create or replace view public.leaderboard
  with (security_invoker = true) as
  select m.id,
         m.name,
         m.first_name,
         m.last_name,
         m.grade,
         m.total_points,
         -- ties break on first name, matching the site's leaderboard
         rank() over (order by m.total_points desc, m.first_name asc) as rank
  from public.members m;

-- security_invoker means the view obeys the caller's RLS on members,
-- which already allows public reads.
grant select on public.leaderboard to anon, authenticated;

commit;

-- ── Verification (run separately, after the commit) ──────────
-- select category, count(*) from public.events group by 1 order by 1;
-- select count(*) from public.events e
--   where not exists (select 1 from public.point_assignments p where p.event_id = e.id);
-- select m.name, m.total_points,
--        (select coalesce(sum(points_awarded),0) from public.point_assignments p where p.member_id = m.id) as recomputed
--   from public.members m
--  where m.total_points <> (select coalesce(sum(points_awarded),0) from public.point_assignments p where p.member_id = m.id);
