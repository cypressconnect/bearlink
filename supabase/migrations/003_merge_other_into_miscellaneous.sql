-- ============================================================
-- Migration 003: fold 'Other' into 'Miscellaneous'
--
-- Run in the Supabase SQL Editor AFTER 002 and after the first
-- "Bear Link -> Import sheet into website" run. Idempotent.
--
-- Why this is needed
-- ------------------
-- Migration 002 left the legacy 'Other' category in place because those
-- events carried real points. The rewritten importer then read the same
-- "Points in General" columns and filed them under 'Miscellaneous'.
-- Both categories map to the same spreadsheet tab, and the unique index
-- from 002 is on (name, category) -- so the same event existed twice and
-- every miscellaneous point was counted twice.
--
-- Measured before this migration: 12 duplicated events, ~1,774 duplicated
-- points, plus a 201-point 'Committee Meetings' rollup duplicating the
-- Committee tab. Members were 20-30 points over their sheet totals.
-- ============================================================

begin;

-- ── 1. Merge each 'Other' event into its 'Miscellaneous' twin ─
-- Move across only the assignments the twin does not already have, so
-- nothing is lost if the two ever diverged.
update public.point_assignments pa
set    event_id = keep.id
from   public.events dup
join   public.events keep
       on lower(btrim(keep.name)) = lower(btrim(dup.name))
      and keep.category = 'Miscellaneous'
where  pa.event_id = dup.id
  and  dup.category = 'Other'
  and  not exists (
         select 1 from public.point_assignments x
         where x.member_id = pa.member_id and x.event_id = keep.id
       );

-- Whatever is left on the 'Other' row is a straight duplicate.
delete from public.point_assignments pa
using public.events dup
where pa.event_id = dup.id
  and dup.category = 'Other'
  and exists (
        select 1 from public.events keep
        where lower(btrim(keep.name)) = lower(btrim(dup.name))
          and keep.category = 'Miscellaneous'
      );

delete from public.events dup
where dup.category = 'Other'
  and exists (
        select 1 from public.events keep
        where lower(btrim(keep.name)) = lower(btrim(dup.name))
          and keep.category = 'Miscellaneous'
      );

-- ── 2. Drop the "Committee Meetings" rollup ──────────────────
-- Column X of "Points in General" mirrors the Committee tab's total.
-- Verified identical to the Committee event (75 members, 201 points),
-- so keeping it would double-count committee attendance.
delete from public.events
where category = 'Other'
  and lower(btrim(name)) = 'committee meetings';

-- ── 3. Anything still in 'Other' becomes 'Miscellaneous' ─────
-- Nothing is deleted here -- unknown leftovers keep their points and
-- simply move to the surviving category.
update public.events
set    category = 'Miscellaneous'
where  category = 'Other'
  and  not exists (
         select 1 from public.events e2
         where lower(btrim(e2.name)) = lower(btrim(public.events.name))
           and e2.category = 'Miscellaneous'
       );

-- ── 4. Retire 'Other' so this cannot happen again ────────────
alter table public.events drop constraint if exists events_category_check;

alter table public.events
  add constraint events_category_check
  check (category in (
    'Attendance',
    'Social',
    'Service',
    'Fundraising',
    'Conference',
    'BAA',
    'Committee',
    'Miscellaneous'
  ));

-- ── 5. Point the merged events at the right tab ──────────────
update public.events
set    sheet_tab = 'Points in General'
where  category = 'Miscellaneous'
  and  (sheet_tab is null or sheet_tab <> 'Points in General');

-- ── 6. Rebuild every total ───────────────────────────────────
update public.members m
set total_points = coalesce((
      select sum(pa.points_awarded)
      from public.point_assignments pa
      where pa.member_id = m.id
    ), 0);

commit;

-- ── Verification (run after the commit) ──────────────────────
-- Expect zero rows from all three:
--
-- select * from public.events where category = 'Other';
--
-- select lower(btrim(name)) as n, count(*)
--   from public.events group by 1 having count(*) > 1;
--
-- select m.name, m.total_points,
--        (select coalesce(sum(points_awarded),0)
--           from public.point_assignments p where p.member_id = m.id) as recomputed
--   from public.members m
--  where m.total_points <> (select coalesce(sum(points_awarded),0)
--                             from public.point_assignments p where p.member_id = m.id);
--
-- Spot-check against the sheet's Top Member List:
-- select first_name, last_name, total_points from public.members
--  order by total_points desc limit 10;
