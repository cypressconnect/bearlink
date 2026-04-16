-- ============================================================
-- Migration 001: first_name/last_name + updated event categories
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add first_name / last_name to members ─────────────────
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Auto-split existing `name` values (splits on first space)
UPDATE public.members
SET
  first_name = CASE
    WHEN position(' ' IN trim(name)) > 0
    THEN trim(split_part(name, ' ', 1))
    ELSE trim(name)
  END,
  last_name = CASE
    WHEN position(' ' IN trim(name)) > 0
    THEN trim(substring(name FROM position(' ' IN trim(name)) + 1))
    ELSE ''
  END
WHERE first_name IS NULL;

-- ── 2. Update event category constraint ──────────────────────
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_category_check
  CHECK (category IN (
    'Attendance',     -- general & officer meetings
    'Social',         -- social events
    'Service',        -- service/volunteer events
    'Fundraising',    -- fundraisers
    'Conference',     -- competitions / conferences
    'BAA',            -- Business Achievement Awards
    'Miscellaneous',  -- misc point events
    'Other'           -- catch-all
  ));

-- ── 3. Migrate any existing category values ───────────────────
UPDATE public.events SET category = 'Attendance'  WHERE category = 'Meeting';
UPDATE public.events SET category = 'Service'     WHERE category IN ('Volunteer', 'Education');
UPDATE public.events SET category = 'Fundraising' WHERE category = 'Fundraiser';
UPDATE public.events SET category = 'Conference'  WHERE category = 'Competition';
-- 'Social' and 'Other' map to themselves — no change needed
