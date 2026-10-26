// ── Auth helpers ─────────────────────────────────────────────
//
// Two ways in:
//   admin  – typed the admin code. Gets a row in admin_profiles. Full
//            access, including admin pages.
//   member – typed the member code. Reads everything, edits nothing.
//
// Both get an anonymous session with no name or email attached.
//   nobody – signed out. Homepage only.
//
// Access is enforced in the database by RLS (migrations 005 and 009). The
// gates here exist so people see a login screen instead of an empty page.

import { supabase } from './supabase-client.js'

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
 * Who is signed in: { session, isAdmin, isMember, displayName } or null.
 * A session that is neither an admin nor a current code login -- an old
 * student account, or a code from last year -- counts as signed out.
 * Cached for the life of the page so a gate plus a nav render is one lookup.
 */
export async function getIdentity({ refresh = false } = {}) {
    if (cachedIdentity && !refresh) return cachedIdentity

    const session = await getSession()
    if (!session) { cachedIdentity = null; return null }

    // A visitor can only ever read their own admin_profiles row, so this
    // comes back empty for members. Treat an error as "no" rather than
    // letting it take down the whole page.
    const [admin, isMember] = await Promise.all([
        supabase.from('admin_profiles').select('id, name')
            .eq('id', session.user.id).maybeSingle()
            .then(r => r.data).catch(() => null),
        supabase.rpc('is_chapter_user')
            .then(r => !!r.data).catch(() => false),
    ])

    if (!admin && !isMember) { cachedIdentity = null; return null }

    cachedIdentity = {
        session,
        user       : session.user,
        isAdmin    : !!admin,
        isMember   : true,
        displayName: admin ? (admin.name ?? 'Admin') : 'Member',
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

function goToLogin({ admin = false } = {}) {
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search)
    location.replace(`login.html?${admin ? 'mode=admin&' : ''}next=${next}`)
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

    if (!me) { goToLogin({ admin: true }); return await new Promise(() => {}) }
    if (!me.isAdmin) {
        // A member, not an admin: send them somewhere they can use
        // rather than bouncing them to a login screen they already passed.
        location.replace('points.html?denied=admin')
        return await new Promise(() => {})
    }
    reveal()
    return me
}

// ── Sign in / out ─────────────────────────────────────────────

/**
 * Sign in with a code: the member code, or the admin code if admin is true.
 *
 * Starts an anonymous session (no name, no email) and asks the database
 * whether the code is right. A wrong code leaves no session behind, so the
 * next try starts clean. Needs "Allow anonymous sign-ins" switched on in
 * the Supabase dashboard -- see migration 009.
 */
export async function signInWithCode(code, { admin = false } = {}) {
    const value = String(code ?? '').trim()
    if (!value) return { error: { message: `Enter the ${admin ? 'admin' : 'member'} code.` } }

    // Reuse an anonymous session (a member stepping up to admin, or someone
    // retyping a code after it changed), but never attach a code to a real
    // account like an old student or email-admin login.
    let session = await getSession()
    if (session && !session.user.is_anonymous) {
        await supabase.auth.signOut()
        session = null
    }
    const startedHere = !session
    if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
            return { error: /anonymous/i.test(error.message)
                ? { message: 'Code login is not switched on yet. Ask an officer.' }
                : error }
        }
        session = data.session
    }

    const fn = admin ? 'redeem_admin_code' : 'redeem_member_code'
    const { data: ok, error } = await supabase.rpc(fn, { p_code: value })
    if (error || !ok) {
        if (startedHere) await supabase.auth.signOut()
        cachedIdentity = null
        return { error: error ?? { message: 'That code is not right. Check with an officer.' } }
    }

    cachedIdentity = null
    return { data: { session } }
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
