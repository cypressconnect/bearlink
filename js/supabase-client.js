// ── Supabase Client ──────────────────────────────────────────
// Replace the two constants below with your project's values.
// Dashboard → Settings → API
//
//   SUPABASE_URL  → "Project URL"
//   SUPABASE_KEY  → "anon / public" key  (safe to expose in frontend)
//
// Both values are also referenced in google-apps-script/Code.gs.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

export const SUPABASE_URL = 'https://lrnlqdxudmoszlaeatst.supabase.co'
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmxxZHh1ZG1vc3psYWVhdHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTA4NzgsImV4cCI6MjA5MTc2Njg3OH0.B6uUexKBMGwn3brnrdsQQLF1Myrqd_4lyOV9GoffhYg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
