// ── Auth helpers ─────────────────────────────────────────────
import { supabase } from './supabase-client.js'

/** Returns the current session, or null if not logged in. */
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
}

/** Returns true if the current user has an admin_profiles row. */
export async function isAdmin() {
    const session = await getSession()
    if (!session) return false
    const { data, error } = await supabase
        .from('admin_profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle()
    return !!data && !error
}

/**
 * Call at the top of every admin page.
 * Redirects to login.html if the visitor is not an authenticated admin.
 */
export async function requireAdmin() {
    const admin = await isAdmin()
    if (admin) return

    window.location.href = 'login.html'
    // Setting location.href does not stop the current script. Without this,
    // the rest of the page keeps running and briefly renders the admin UI
    // to a signed-out visitor before the browser navigates away.
    document.body?.style.setProperty('visibility', 'hidden')
    await new Promise(() => {})
}

/** Sign in with email + password. Returns { error } on failure. */
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
}

/** Sign out and redirect to login. */
export async function signOut() {
    await supabase.auth.signOut()
    window.location.href = 'login.html'
}
