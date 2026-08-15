// ── Data helpers (shared across pages) ───────────────────────
import { supabase } from './supabase-client.js'

/**
 * The categories the app understands. These must match the CHECK
 * constraint in supabase/migrations/002_repair_and_harden.sql and the
 * TAB_ALIASES maps in the two edge functions + Code.gs.
 */
export const CATEGORIES = [
    { value: 'Attendance',    label: 'Attendance (meetings)', sheet: 'Attendance',        fixedPoints: 2  },
    { value: 'Social',        label: 'Social',                sheet: 'Social',            fixedPoints: null },
    { value: 'Service',       label: 'Service project',       sheet: 'Services',          fixedPoints: null },
    { value: 'Fundraising',   label: 'Fundraiser',            sheet: 'Fundraising',       fixedPoints: null },
    { value: 'Conference',    label: 'Conference',            sheet: 'Conferences',       fixedPoints: 12 },
    { value: 'BAA',           label: 'Business Achievement Award', sheet: 'BAA',          fixedPoints: 6  },
    { value: 'Committee',     label: 'Committee meeting',     sheet: 'Committees', fixedPoints: null },
    { value: 'Miscellaneous', label: 'Miscellaneous points',  sheet: 'Points In General', fixedPoints: null },
]

export const categoryInfo = (value) => CATEGORIES.find(c => c.value === value) ?? null

// ── Leaderboard / Members ────────────────────────────────────

/** All members, highest points first. */
export async function fetchLeaderboard() {
    const { data, error } = await supabase
        .from('members')
        .select('id, name, first_name, last_name, grade, total_points')
        // Ties break on first name, A->Z.
        .order('total_points', { ascending: false })
        .order('first_name', { ascending: true })
    if (error) throw error
    return data
}

/** One member plus their full point history. */
export async function fetchMember(memberId) {
    const { data: member, error: memberErr } = await supabase
        .from('members')
        .select('id, name, first_name, last_name, email, grade, student_id, total_points')
        .eq('id', memberId)
        .single()
    if (memberErr) throw memberErr

    const { data: assignments, error: assignErr } = await supabase
        .from('point_assignments')
        .select('points_awarded, assigned_at, event_id, events(id, name, category, event_date, point_value)')
        .eq('member_id', memberId)
    if (assignErr) throw assignErr

    // Newest first, undated events last.
    const sorted = (assignments ?? []).sort((a, b) => {
        const da = a.events?.event_date, db = b.events?.event_date
        if (da && db) return db.localeCompare(da)
        if (da) return -1
        if (db) return 1
        return (a.events?.name ?? '').localeCompare(b.events?.name ?? '')
    })

    return { ...member, assignments: sorted }
}

/** Create a member, then give them a row on every tab of the sheet. */
export async function createMember({ first_name, last_name, grade, email, student_id }) {
    const first = (first_name ?? '').trim()
    const last  = (last_name ?? '').trim()
    if (!first && !last) throw new Error('A first or last name is required.')

    const { data: clash } = await supabase
        .from('members')
        .select('id')
        .ilike('first_name', first)
        .ilike('last_name', last)
        .maybeSingle()
    if (clash) throw new Error(`${first} ${last} is already a member.`)

    const { data, error } = await supabase
        .from('members')
        .insert({
            name      : `${first} ${last}`.trim(),
            first_name: first,
            last_name : last,
            grade     : grade ? Number(grade) : null,
            email     : email?.trim() || null,
            student_id: student_id?.trim() || null,
        })
        .select()
        .single()
    if (error) throw error

    // Non-fatal: the member exists in the DB even if the sheet write fails.
    const sheet = await callSheetSync({ action: 'add_member_row', member_id: data.id })
        .then(r => ({ ok: true, detail: r }))
        .catch(err => ({ ok: false, detail: err.message }))

    return { member: data, sheet }
}

/**
 * Update a member. If the name changed, rename their spreadsheet row too --
 * otherwise the row is orphaned and the next import recreates them under the
 * old name as a second member.
 */
export async function updateMember(memberId, fields) {
    const renaming = fields.first_name != null || fields.last_name != null
    let before = null
    if (renaming) {
        const { data } = await supabase
            .from('members').select('first_name, last_name').eq('id', memberId).maybeSingle()
        before = data
    }

    const { error } = await supabase.from('members').update(fields).eq('id', memberId)
    if (error) throw error

    if (!renaming || !before) return { sheet: { ok: true, detail: 'no rename' } }
    const changed = (fields.first_name ?? before.first_name) !== before.first_name
                 || (fields.last_name ?? before.last_name) !== before.last_name
    if (!changed) return { sheet: { ok: true, detail: 'no rename' } }

    const sheet = await callSheetSync({
        action   : 'rename_member_row',
        member_id: memberId,
        old_first: before.first_name,
        old_last : before.last_name,
    }).then(r => ({ ok: true, detail: r }))
      .catch(err => ({ ok: false, detail: err.message }))

    return { sheet }
}

export async function deleteMember(memberId) {
    const { data: m } = await supabase
        .from('members').select('first_name, last_name').eq('id', memberId).maybeSingle()

    const { error } = await supabase.from('members').delete().eq('id', memberId)
    if (error) throw error

    if (m) {
        await callSheetSync({
            action: 'remove_member_row', first_name: m.first_name, last_name: m.last_name,
        }).catch(err => console.warn('Sheet row removal failed:', err.message))
    }
}

// ── Events ───────────────────────────────────────────────────

/** All events, newest first, undated last. */
export async function fetchEvents() {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true })
    if (error) throw error
    return data
}

/** Events with how many members have been awarded each one. */
export async function fetchEventsWithCounts() {
    const [{ data: events, error: evErr }, { data: rows, error: paErr }] = await Promise.all([
        supabase.from('events').select('*')
            .order('event_date', { ascending: false, nullsFirst: false }),
        supabase.from('point_assignments').select('event_id, points_awarded'),
    ])
    if (evErr) throw evErr
    if (paErr) throw paErr

    const counts = new Map()
    for (const r of rows ?? []) {
        const c = counts.get(r.event_id) ?? { members: 0, points: 0 }
        c.members += 1
        c.points  += r.points_awarded ?? 0
        counts.set(r.event_id, c)
    }
    return (events ?? []).map(e => ({ ...e, ...(counts.get(e.id) ?? { members: 0, points: 0 }) }))
}

/**
 * Create an event and add its column to the spreadsheet.
 * Rejects duplicates up front so the sheet never grows a second column
 * for the same thing.
 */
export async function createEvent({ name, point_value, category, event_date }) {
    const clean = (name ?? '').trim()
    if (!clean) throw new Error('Event name is required.')
    if (!CATEGORIES.some(c => c.value === category)) throw new Error(`Unknown category: ${category}`)

    const { data: clash } = await supabase
        .from('events').select('id, name').eq('category', category).ilike('name', clean).maybeSingle()
    if (clash) throw new Error(`"${clash.name}" already exists in ${category}.`)

    const info = categoryInfo(category)
    const { data, error } = await supabase
        .from('events')
        .insert({
            name        : clean,
            point_value : Number(point_value) || 0,
            category,
            event_date  : event_date || null,
            sheet_tab   : info?.sheet ?? null,
            sheet_header: clean,
        })
        .select()
        .single()
    if (error) throw error

    const sheet = await callSheetSync({ action: 'add_event_column', event_id: data.id })
        .then(r => ({ ok: true, detail: r }))
        .catch(err => ({ ok: false, detail: err.message }))

    return { event: data, sheet }
}

export async function updateEvent(eventId, fields) {
    const { error } = await supabase.from('events').update(fields).eq('id', eventId)
    if (error) throw error
    if (fields.name) {
        await callSheetSync({ action: 'rename_event', event_id: eventId })
            .catch(err => console.warn('Sheet header rename failed:', err.message))
    }
}

/**
 * Delete an event, and remove its column from the spreadsheet.
 * Leaving the column behind would make the next sheet import recreate the
 * event, so a deletion on the site would silently undo itself.
 */
export async function deleteEvent(eventId, { removeSheetColumn = true } = {}) {
    const { data: ev } = await supabase
        .from('events').select('name, category, sheet_tab, sheet_header').eq('id', eventId).maybeSingle()

    const { error } = await supabase.from('events').delete().eq('id', eventId)
    if (error) throw error

    if (!ev || !removeSheetColumn) return { sheet: { ok: true, detail: 'skipped' } }

    const sheet = await callSheetSync({
        action  : 'delete_event_column',
        category: ev.category,
        header  : ev.sheet_header || ev.name,
        sheet_tab: ev.sheet_tab,
    }).then(r => ({ ok: true, detail: r }))
      .catch(err => ({ ok: false, detail: err.message }))

    return { sheet }
}

// ── Point assignments ────────────────────────────────────────

/**
 * Award points for one event to a set of members.
 *
 * @param {string}   eventId
 * @param {string[]} memberIds
 * @param {number|Record<string, number>} points
 *        A single value for everyone, or a map of memberId -> points.
 */
export async function assignPoints(eventId, memberIds, points) {
    const rows = memberIds.map(member_id => ({
        member_id,
        event_id      : eventId,
        points_awarded: typeof points === 'number' ? points : (points[member_id] ?? 0),
    }))

    const awarded = rows.filter(r => r.points_awarded > 0)
    const cleared = rows.filter(r => r.points_awarded <= 0).map(r => r.member_id)

    if (awarded.length) {
        const { error } = await supabase
            .from('point_assignments')
            .upsert(awarded, { onConflict: 'member_id,event_id' })
        if (error) throw error
    }
    // 0 points means "not awarded" -- do not leave a zero row behind.
    if (cleared.length) {
        const { error } = await supabase
            .from('point_assignments').delete().eq('event_id', eventId).in('member_id', cleared)
        if (error) throw error
    }

    return { awarded: awarded.length, cleared: cleared.length }
}

/** Award (or change) one member's points for one event. */
export async function setAssignment(memberId, eventId, pointsAwarded) {
    const pts = Number(pointsAwarded) || 0
    if (pts <= 0) return removeAssignment(memberId, eventId)

    const { error } = await supabase
        .from('point_assignments')
        .upsert([{ member_id: memberId, event_id: eventId, points_awarded: pts }],
                { onConflict: 'member_id,event_id' })
    if (error) throw error
}

export async function removeAssignment(memberId, eventId) {
    const { error } = await supabase
        .from('point_assignments').delete().eq('member_id', memberId).eq('event_id', eventId)
    if (error) throw error
}

/**
 * total_points is maintained by a database trigger on point_assignments,
 * so there is nothing to recompute here -- just read the fresh value.
 */
export async function refreshMemberTotal(memberId) {
    const { data, error } = await supabase
        .from('members').select('total_points').eq('id', memberId).single()
    if (error) throw error
    return data.total_points
}

// ── Google Sheet bridge ──────────────────────────────────────

/**
 * Call the sync-to-sheets edge function. It verifies the caller is an
 * admin, so the browser session must be signed in.
 */
async function callSheetSync(body) {
    const { data, error } = await supabase.functions.invoke('sync-to-sheets', { body })
    if (error) {
        let detail = ''
        try { detail = await error.context?.text() ?? '' } catch { /* body already read */ }
        try { detail = JSON.parse(detail).error ?? detail } catch { /* not JSON */ }
        throw new Error(detail || error.message)
    }
    if (data && data.ok === false) throw new Error(data.error ?? 'Sheet sync failed')
    return data
}

/** Push one member's points for one event into the spreadsheet. */
export async function syncAssignmentToSheet(memberId, eventId) {
    return callSheetSync({ action: 'write_points', member_id: memberId, event_id: eventId })
}

/** Push every point one member has into the spreadsheet. */
export async function resyncMemberToSheet(memberId) {
    return callSheetSync({ action: 'resync_member', member_id: memberId })
}

/** Structural report on the spreadsheet — used by the dashboard's Sheet Status. */
export async function sheetHealth() {
    return callSheetSync({ action: 'health' })
}

/**
 * Push a batch of members for one event, reporting per-member failures
 * instead of aborting the whole run.
 */
export async function syncBatchToSheet(memberIds, eventId, onProgress) {
    const failures = []
    let done = 0
    for (const memberId of memberIds) {
        try {
            await syncAssignmentToSheet(memberId, eventId)
        } catch (err) {
            failures.push({ memberId, error: err.message })
        }
        onProgress?.(++done, memberIds.length)
    }
    return failures
}
