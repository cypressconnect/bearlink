// ── Auth helpers ─────────────────────────────────────────────
//
// Two kinds of account:
//   admin   – a row in admin_profiles. Full access, including admin pages.
//   student – a row in student_profiles. Reads everything, edits nothing.
//   nobody  – signed out. Homepage only.
//
// Access is enforced in the database by RLS (migration 005). The gates here
// exist so people see a login screen instead of an empty page.

import { supabase } from './supabase-client.js'

/** A CFISD student address: 4 letters, 4 digits, @stu.cfisd.net */
export const SCHOOL_EMAIL_RE = /^[a-z]{4}[0-9]{4}@stu\.cfisd\.net$/i

export function schoolEmailError(email) {
    const value = String(email ?? '').trim()
    if (!value) return 'Enter your school email.'
    if (!value.toLowerCase().endsWith('@stu.cfisd.net')) {
        return 'Use your school email — it has to end in @stu.cfisd.net'
    }
    if (!SCHOOL_EMAIL_RE.test(value)) {
        return 'That does not look like a CFISD student address. It should be four letters, then four numbers, e.g. abcd1234@stu.cfisd.net'
    }
    return null
}

// ── Session ──────────────────────────────────────────────────

/**
 * The current session, or null.
 *
 * getSession() reads the stored session and refreshes it if the access token
 * has expired, so a page opened hours later still comes back signed in. Only
 * treat someone as signed out once this has actually resolved -- checking
 * localStorage directly is what makes navigation look like a logout.
 */
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
}

let cachedIdentity = null

/**
 * Who is signed in: { session, isAdmin, profile, displayName } or null.
 * Cached for the life of the page so a gate plus a nav render is one lookup.
 */
export async function getIdentity({ refresh = false } = {}) {
    if (cachedIdentity && !refresh) return cachedIdentity

    const session = await getSession()
    if (!session) { cachedIdentity = null; return null }

    // Each visitor can only ever read their own row in one of these, so the
    // other comes back empty. Treat an error as "no row" rather than letting
    // it take down the whole page.
    const [admin, profile] = await Promise.all([
        supabase.from('admin_profiles').select('id, name')
            .eq('id', session.user.id).maybeSingle()
            .then(r => r.data).catch(() => null),
        supabase.from('student_profiles').select('id, full_name, email, member_id')
            .eq('id', session.user.id).maybeSingle()
            .then(r => r.data).catch(() => null),
    ])

    cachedIdentity = {
        session,
        user       : session.user,
        isAdmin    : !!admin,
        profile    : profile ?? null,
        displayName: profile?.full_name ?? admin?.name ?? session.user.email ?? 'Signed in',
    }
    return cachedIdentity
}

export async function isAdmin() {
    return !!(await getIdentity())?.isAdmin
}

// ── Page gates ───────────────────────────────────────────────

/**
 * Hide the page until we know who the visitor is, so nothing flashes on
 * screen before a redirect. Returns a function that reveals it again.
 */
function holdPaint() {
    const style = document.createElement('style')
    style.id = 'auth-gate'
    style.textContent = 'body{visibility:hidden !important}'
    document.head.appendChild(style)
    return () => document.getElementById('auth-gate')?.remove()
}

function goToLogin() {
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search)
    location.replace(`login.html?next=${next}`)
}

/**
 * Show a plain message instead of a page that never appears.
 * Without this, any failure inside a gate leaves the body hidden forever.
 */
function fail(reveal, message) {
    reveal()
    document.body.innerHTML = `
        <div style="max-width:32rem;margin:15vh auto;padding:2rem;font-family:Inter,system-ui,sans-serif;text-align:center">
          <h1 style="font-size:1.25rem;font-weight:700;color:#001a48;margin-bottom:.75rem">Could not check your sign-in</h1>
          <p style="color:#444651;font-size:.9rem;line-height:1.6;margin-bottom:1.5rem">${message}</p>
          <a href="login.html" style="display:inline-block;background:#001a48;color:#fff;padding:.75rem 1.5rem;border-radius:.5rem;font-weight:700;font-size:.875rem;text-decoration:none">Go to sign in</a>
        </div>`
}

/** Any signed-in chapter user. Use on member-facing pages. */
export async function requireUser() {
    const reveal = holdPaint()
    let me
    try {
        me = await getIdentity()
    } catch (err) {
        fail(reveal, `Something went wrong reaching the server. ${err?.message ?? ''}`)
        return await new Promise(() => {})
    }
    if (!me) { goToLogin(); return await new Promise(() => {}) }
    reveal()
    return me
}

/** Admins only. Use at the top of every admin page. */
export async function requireAdmin() {
    const reveal = holdPaint()
    let me
    try {
        me = await getIdentity()
    } catch (err) {
        fail(reveal, `Something went wrong reaching the server. ${err?.message ?? ''}`)
        return await new Promise(() => {})
    }

    if (!me) { goToLogin(); return await new Promise(() => {}) }
    if (!me.isAdmin) {
        // Signed in, but not an admin: send them somewhere they can use
        // rather than bouncing them to a login screen they already passed.
        location.replace('points.html?denied=admin')
        return await new Promise(() => {})
    }
    reveal()
    return me
}

// ── Sign in / up / out ───────────────────────────────────────

/** Email + password. Works for admins and students alike. */
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email ?? '').trim().toLowerCase(),
        password,
    })
    if (!error) cachedIdentity = null
    return { data, error }
}

/**
 * Create a student account.
 *
 * The student_profiles row is written by a database trigger, so there is
 * nothing to insert here and no window where an account exists without a
 * profile. If the project has email confirmation switched on, signUp comes
 * back without a session -- that is not an error, they just have to confirm
 * first, so say so rather than looking broken.
 */
export async function signUpStudent({ fullName, email, password }) {
    const name = String(fullName ?? '').trim()
    if (name.length < 2) return { error: { message: 'Enter your full name.' } }

    const emailError = schoolEmailError(email)
    if (emailError) return { error: { message: emailError } }

    if (String(password ?? '').length < 8) {
        return { error: { message: 'Password must be at least 8 characters.' } }
    }

    const { data, error } = await supabase.auth.signUp({
        email   : String(email).trim().toLowerCase(),
        password,
        options : { data: { full_name: name } },
    })
    if (error) return { error }

    cachedIdentity = null
    return { data, needsConfirmation: !data.session }
}

export async function signOut(redirectTo = 'index.html') {
    cachedIdentity = null
    await supabase.auth.signOut()
    location.replace(redirectTo)
}

// ── Shared nav behaviour ─────────────────────────────────────

/**
 * Wire up whatever auth controls a page has:
 *   [data-signout]      – becomes a sign-out button
 *   [data-auth-name]    – filled with the signed-in person's name
 *   [data-when-in]      – shown only when signed in
 *   [data-when-out]     – shown only when signed out
 *   [data-when-admin]   – shown only for admins
 * Safe to call on public pages; it just reports "signed out".
 */
export async function initAuthNav() {
    const me = await getIdentity()

    document.querySelectorAll('[data-signout]').forEach(el =>
        el.addEventListener('click', (e) => { e.preventDefault(); signOut() }))

    document.querySelectorAll('[data-auth-name]').forEach(el => {
        el.textContent = me?.displayName ?? ''
    })

    const toggle = (sel, on) => document.querySelectorAll(sel)
        .forEach(el => el.classList.toggle('hidden', !on))

    toggle('[data-when-in]', !!me)
    toggle('[data-when-out]', !me)
    toggle('[data-when-admin]', !!me?.isAdmin)

    return me
}

// Keep every open tab in step: signing out in one signs out the rest.
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') cachedIdentity = null
})
