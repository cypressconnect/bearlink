-- ============================================================
-- Migration 004: remove two leftover Services columns
--
-- Run in the Supabase SQL Editor. Idempotent.
--
--  * "SilverCrest" (column R, no date) -- leftover from testing.
--    Exactly one member had a value in it (4 points), which made
--    that member's site total read 4 higher than the sheet.
--
--  * "Helped With Books (+1)" (column T) -- sits to the RIGHT of the
--    "Points for Service Projects Participated In" subtotal, so the
--    sheet never counted it. No member had a value in it.
--
-- Delete the matching columns in the spreadsheet too, otherwise the
-- next import recreates "SilverCrest" (it sits LEFT of the subtotal,
-- so the new right-of-subtotal rule does not filter it out).
-- ============================================================

begin;

-- Deleting the event cascades to its point_assignments.
delete from public.events
where category = 'Service'
  and lower(btrim(name)) in ('silvercrest', 'helped with books (+1)');

-- Rebuild totals for anyone who lost points.
update public.members m
set total_points = coalesce((
      select sum(pa.points_awarded)
      from public.point_assignments pa
      where pa.member_id = m.id
    ), 0);

commit;

-- ── Verification ─────────────────────────────────────────────
-- Expect zero rows:
--   select * from public.events
--    where category = 'Service'
--      and lower(btrim(name)) in ('silvercrest','helped with books (+1)');
--
-- Spot-check any affected member's total:
--   select first_name, last_name, total_points from public.members
--    order by total_points desc limit 10;
