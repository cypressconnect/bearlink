// ── Data helpers (shared across pages) ───────────────────────
import { supabase } from './supabase-client.js'

/**
 * Categories that can be created and awarded from the website. These must
 * match the CHECK constraint in 002_repair_and_harden.sql and the
 * TAB_ALIASES maps in the two edge functions + Code.gs.
 *
 * Attendance and Conference are deliberately missing — see
 * SHEET_MANAGED_CATEGORIES.
 */
export const CATEGORIES = [
    { value: 'Social',        label: 'Social',                sheet: 'Social',            fixedPoints: null },
    { value: 'Service',       label: 'Service project',       sheet: 'Services',          fixedPoints: null },
    { value: 'Fundraising',   label: 'Fundraiser',            sheet: 'Fundraising',       fixedPoints: null },
    { value: 'BAA',           label: 'Business Achievement Award', sheet: 'BAA',          fixedPoints: 6  },
    { value: 'Committee',     label: 'Committee meeting',     sheet: 'Committees',        fixedPoints: null },
    { value: 'Miscellaneous', label: 'Miscellaneous points',  sheet: 'Points In General', fixedPoints: null },
]

/**
 * Categories that live in the spreadsheet only.
 *
 * "# General Meetings Attended" is an ARRAYFORMULA fed by the meeting
 * sign-in form, and "Area Conference (November 2025)" is an ARRAYFORMULA
 * over IMPORTRANGE from another spreadsheet. Writing to either would break
 * the formula and blank the column for all 200 members, so the sync refuses.
 * Rather than let an officer find that out halfway through awarding points,
 * these are not offered on the site at all.
 */
export const SHEET_MANAGED_CATEGORIES = {
    Attendance: 'Attendance comes from the meeting sign-in form. Record it in the spreadsheet.',
    Conference: 'Conference attendance is pulled from another spreadsheet. Record it there.',
}

export const isSheetManaged = (category) => category in SHEET_MANAGED_CATEGORIES

export const categoryInfo = (value) => CATEGORIES.find(c => c.value === value) ?? null

/**
 * Attendance points are a meeting count times this (POINTS_PER_MEETING in
 * Code.gs), so the count can be recovered from the points.
 */
export const POINTS_PER_MEETING = 2

/** "4 meetings" for an Attendance assignment, null for anything else. */
export function meetingLabel(assignment) {
    if (assignment.events?.category !== 'Attendance') return null
    const n = Math.round((assignment.points_awarded ?? 0) / POINTS_PER_MEETING)
    return `${n} meeting${n === 1 ? '' : 's'}`
}

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

    // Non-fatal: the member exists in the DB even if the sheet side cannot
    // be updated. The roster is generated by a formula, so this normally
    // comes back as `managed`, telling the admin where to add them instead.
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
    // The column is found by its current header, so read it before renaming.
    const { data: before } = await supabase
        .from('events').select('name, sheet_header').eq('id', eventId).maybeSingle()

    const { error } = await supabase.from('events').update(fields).eq('id', eventId)
    if (error) throw error
    if (fields.name && before && fields.name !== before.name) {
        await callSheetSync({
            action    : 'rename_event',
            event_id  : eventId,
            old_header: before.sheet_header || before.name,
        }).catch(err => console.warn('Sheet header rename failed:', err.message))
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
    }).then(r => ({ ok: true, skipped: !!r?.skipped, detail: r }))
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

// ── Homepage timeline ────────────────────────────────────────

/** Timeline entries, soonest first, undated last. Readable signed out. */
export async function fetchTimeline() {
    const { data, error } = await supabase
        .from('timeline_events')
        .select('*')
        .order('event_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
    if (error) throw error
    return data
}

function timelineFields({ tag, title, description, event_date }) {
    const clean = (title ?? '').trim()
    if (!clean) throw new Error('Title is required.')
    return {
        tag        : (tag ?? '').trim(),
        title      : clean,
        description: (description ?? '').trim(),
        event_date : event_date || null,
    }
}

export async function createTimelineEvent(fields) {
    const { error } = await supabase.from('timeline_events').insert(timelineFields(fields))
    if (error) throw error
}

export async function updateTimelineEvent(id, fields) {
    const { error } = await supabase.from('timeline_events').update(timelineFields(fields)).eq('id', id)
    if (error) throw error
}

export async function deleteTimelineEvent(id) {
    const { error } = await supabase.from('timeline_events').delete().eq('id', id)
    if (error) throw error
}

// ── Login codes ──────────────────────────────────────────────

/** The member and admin codes. Admins only (migration 009). */
export async function fetchAccessCodes() {
    const { data, error } = await supabase
        .from('access_codes').select('member_code, admin_code, updated_at').maybeSingle()
    if (error) throw error
    return data
}

/**
 * Changing a code signs out everyone who used the old one -- apart from
 * the admin making the change.
 */
export async function updateAccessCodes({ member_code, admin_code }) {
    const member = String(member_code ?? '').trim()
    const admin  = String(admin_code ?? '').trim()
    if (member.length < 4 || admin.length < 4) throw new Error('Each code needs at least 4 characters.')
    if (member.toUpperCase() === admin.toUpperCase()) throw new Error('The member and admin codes must be different.')
    const { error } = await supabase
        .from('access_codes')
        .update({ member_code: member, admin_code: admin, updated_at: new Date().toISOString() })
        .eq('id', true)
    if (error) throw error
    return { member_code: member, admin_code: admin }
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
    if (data && data.ok === false) {
        const err = new Error(data.error ?? 'Sheet sync failed')
        // `managed` means the sheet is driven by a formula and the change has
        // to be made at its source -- not a failure the admin can retry.
        if (data.managed) { err.managed = data.managed; err.sourceId = data.sourceId }
        throw err
    }
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
