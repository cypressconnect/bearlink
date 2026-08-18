// ── Supabase Client ──────────────────────────────────────────
// Dashboard → Settings → API
//   SUPABASE_URL  → "Project URL"
//   SUPABASE_KEY  → "anon / public" key (safe to expose; RLS does the work)
//
// The same values are referenced in google-apps-script/Code.gs.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

export const SUPABASE_URL = 'https://lrnlqdxudmoszlaeatst.supabase.co'
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmxxZHh1ZG1vc3psYWVhdHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTA4NzgsImV4cCI6MjA5MTc2Njg3OH0.B6uUexKBMGwn3brnrdsQQLF1Myrqd_4lyOV9GoffhYg'

/**
 * One storage key shared by every page, so a session started on the login
 * page is the same session the leaderboard sees. Each page builds its own
 * client object; without a fixed key they can end up reading different
 * slots and a navigation looks like a logout.
 *
 * autoRefreshToken keeps a long session alive instead of expiring mid-visit,
 * which is the other half of the same complaint.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storageKey        : 'bearlink-auth',
        storage           : window.localStorage,
        persistSession    : true,
        autoRefreshToken  : true,
        detectSessionInUrl: true,
        flowType          : 'pkce',
    },
})
