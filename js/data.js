// ── Data helpers (shared across pages) ───────────────────────
import { supabase } from './supabase-client.js'

// ── Leaderboard / Members ────────────────────────────────────

/** Fetch all members ordered by total_points descending. */
export async function fetchLeaderboard() {
    const { data, error } = await supabase
        .from('members')
        .select('id, name, grade, total_points')
        .order('total_points', { ascending: false })
    if (error) throw error
    return data
}

/** Fetch a single member with their full event history. */
export async function fetchMember(memberId) {
    const { data: member, error: memberErr } = await supabase
        .from('members')
        .select('id, name, email, grade, student_id, total_points')
        .eq('id', memberId)
        .single()
    if (memberErr) throw memberErr

    const { data: assignments, error: assignErr } = await supabase
        .from('point_assignments')
        .select('points_awarded, event_id, events(id, name, category, event_date)')
        .eq('member_id', memberId)
    if (assignErr) throw assignErr

    return { ...member, assignments }
}

// ── Events ───────────────────────────────────────────────────

/** Fetch all events ordered by most recent. */
export async function fetchEvents() {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false })
    if (error) throw error
    return data
}

/** Create a new event. */
export async function createEvent({ name, point_value, category, event_date }) {
    const { data, error } = await supabase
        .from('events')
        .insert({ name, point_value, category, event_date })
        .select()
        .single()
    if (error) throw error
    return data
}

/** Delete an event by id. */
export async function deleteEvent(eventId) {
    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
    if (error) throw error
}

// ── Point Assignment ─────────────────────────────────────────

/**
 * Assign points from a specific event to multiple members.
 * Uses upsert so re-submitting the same event/member pair is safe.
 *
 * @param {string}   eventId   - UUID of the event
 * @param {string[]} memberIds - Array of member UUIDs
 * @param {number}   pointValue
 */
export async function assignPoints(eventId, memberIds, pointValue) {
    const rows = memberIds.map(member_id => ({
        member_id,
        event_id: eventId,
        points_awarded: pointValue,
    }))
    const { error } = await supabase
        .from('point_assignments')
        .upsert(rows, { onConflict: 'member_id,event_id' })
    if (error) throw error
}

/** Remove a point assignment (un-award points). */
export async function removeAssignment(memberId, eventId) {
    const { error } = await supabase
        .from('point_assignments')
        .delete()
        .eq('member_id', memberId)
        .eq('event_id', eventId)
    if (error) throw error
}

// ── Members CRUD ─────────────────────────────────────────────

/** Create a new member. */
export async function createMember({ name, email, grade, student_id }) {
    const { data, error } = await supabase
        .from('members')
        .insert({ name, email, grade, student_id })
        .select()
        .single()
    if (error) throw error
    return data
}

/** Update a member's details. */
export async function updateMember(memberId, fields) {
    const { error } = await supabase
        .from('members')
        .update(fields)
        .eq('id', memberId)
    if (error) throw error
}

/** Update points_awarded for a single assignment (identified by member+event). */
export async function updatePointsAwarded(memberId, eventId, pointsAwarded) {
    const { error } = await supabase
        .from('point_assignments')
        .update({ points_awarded: pointsAwarded })
        .eq('member_id', memberId)
        .eq('event_id', eventId)
    if (error) throw error
}

/** Recalculate a member's total_points from their assignments and save it. */
export async function recalcMemberTotal(memberId) {
    const { data, error } = await supabase
        .from('point_assignments')
        .select('points_awarded')
        .eq('member_id', memberId)
    if (error) throw error
    const total = (data ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    await updateMember(memberId, { total_points: total })
    return total
}

/**
 * Add a new column header (and zero-fill existing rows) in the Google Sheet
 * for a newly created event. No-ops gracefully if the category has no sheet tab.
 */
export async function triggerSheetAddEventColumn(category, eventName) {
    const { error } = await supabase.functions.invoke('sync-to-sheets', {
        body: { action: 'add_event_column', category, event_name: eventName },
    })
    if (error) {
        const detail = error.context
            ? await error.context.text().catch(() => '')
            : ''
        throw new Error(detail || error.message)
    }
}


/** Update a single cell in the Google Sheet for the given assignment. */
export async function triggerSheetSync(memberId, category, eventName, value) {
    const { error } = await supabase.functions.invoke('sync-to-sheets', {
        body: { member_id: memberId, category, event_name: eventName, value },
    })
    if (error) {
        const detail = error.context
            ? await error.context.text().catch(() => '')
            : ''
        throw new Error(detail || error.message)
    }
}

/** Delete a member. */
export async function deleteMember(memberId) {
    const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', memberId)
    if (error) throw error
}
