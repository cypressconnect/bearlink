/**
 * Supabase Edge Function: sheet-sync   (Google Sheet -> website)
 *
 * Deploy:  supabase functions deploy sheet-sync --no-verify-jwt
 *
 * Apps Script cannot hold the service-role key, so it authenticates with
 * a shared secret and this function does the privileged writes.
 *
 * ── Setup ────────────────────────────────────────────────────────────
 * 1. Generate a random secret (a UUID is fine).
 * 2. Supabase -> Edge Functions -> Secrets -> SHEET_SYNC_SECRET
 * 3. supabase functions deploy sheet-sync --no-verify-jwt
 * 4. In the Apps Script editor run setSheetSyncSecret() once.
 *
 * ── Actions ──────────────────────────────────────────────────────────
 *  ping                       {}
 *  resolve_members            {}                       -> { map: "first|last" -> id }
 *  create_members             { members: [...] }        dedupes on first+last
 *  delete_member              { first_name, last_name }
 *  get_or_create_event        { name, category, point_value, sheet_tab, sheet_header, event_date }
 *  bulk_get_or_create_events  { events: [...] }         -> { map: "name|category" -> id }
 *  upsert_assignment          { member_id, event_id, points_awarded }
 *  delete_assignment          { member_id, event_id }
 *  bulk_upsert_assignments    { assignments: [...] }
 *  replace_event_assignments  { event_id, assignments: [...] }
 *        Makes the DB exactly match the sheet column: upserts what is
 *        listed and deletes every other assignment for that event. This
 *        is what makes clearing a cell in the sheet actually remove the
 *        points.
 *  recalc_totals              {}                        rebuild total_points
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SYNC_SECRET  = Deno.env.get('SHEET_SYNC_SECRET')!

// 'Other' was retired in migration 003: it mapped to the same spreadsheet
// tab as 'Miscellaneous', so the same column existed under two categories
// and every point was counted twice.
const VALID_CATEGORIES = new Set([
  'Attendance', 'Social', 'Service', 'Fundraising',
  'Conference', 'BAA', 'Committee', 'Miscellaneous',
])

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const key = (a: unknown, b: unknown) =>
  `${String(a ?? '').trim().toLowerCase()}|${String(b ?? '').trim().toLowerCase()}`

/** Timing-safe-ish comparison so the secret can't be probed byte by byte. */
function secretMatches(given: string | null): boolean {
  if (!given || given.length !== SYNC_SECRET.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ SYNC_SECRET.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (!secretMatches(req.headers.get('x-sheet-secret'))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { action, ...payload } = body
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    switch (action) {

      case 'ping':
        return json({ ok: true, ts: new Date().toISOString() })

      // ── Members ───────────────────────────────────────────────
      case 'resolve_members': {
        const map: Record<string, string> = {}
        let from = 0
        for (;;) {
          const { data, error } = await sb
            .from('members').select('id, first_name, last_name').range(from, from + 999)
          if (error) throw error
          for (const m of data ?? []) map[key(m.first_name, m.last_name)] = m.id
          if (!data || data.length < 1000) break
          from += 1000
        }
        return json({ map, count: Object.keys(map).length })
      }

      case 'create_members': {
        const incoming: any[] = payload.members ?? []
        if (!incoming.length) return json({ ok: true, created: 0 })

        // Skip anyone already in the DB (the sheet is re-imported often).
        const { data: existing, error: exErr } = await sb
          .from('members').select('first_name, last_name').limit(5000)
        if (exErr) throw exErr
        const seen = new Set((existing ?? []).map(m => key(m.first_name, m.last_name)))

        const rows = incoming
          .filter(m => {
            const k = key(m.first_name, m.last_name)
            if (!m.first_name && !m.last_name) return false
            if (seen.has(k)) return false
            seen.add(k)                                  // also dedupes within the batch
            return true
          })
          .map(m => ({
            name      : `${String(m.first_name ?? '').trim()} ${String(m.last_name ?? '').trim()}`.trim(),
            first_name: String(m.first_name ?? '').trim(),
            last_name : String(m.last_name ?? '').trim(),
            grade     : Number.isFinite(Number(m.grade)) && Number(m.grade) >= 9 && Number(m.grade) <= 12
                          ? Number(m.grade) : null,
          }))

        if (!rows.length) return json({ ok: true, created: 0, skipped: incoming.length })

        const { data, error } = await sb.from('members').insert(rows).select('id')
        if (error) throw error
        return json({ ok: true, created: data?.length ?? 0, skipped: incoming.length - rows.length })
      }

      case 'delete_member': {
        const { error } = await sb.from('members').delete()
          .ilike('first_name', String(payload.first_name ?? '').trim())
          .ilike('last_name',  String(payload.last_name  ?? '').trim())
        if (error) throw error
        return json({ ok: true })
      }

      // ── Events ────────────────────────────────────────────────
      case 'get_or_create_event': {
        const name     = String(payload.name ?? '').trim()
        const category = String(payload.category ?? '').trim()
        if (!name)                        return json({ error: 'name is required' }, 400)
        if (!VALID_CATEGORIES.has(category)) return json({ error: `Invalid category: ${category}` }, 400)

        const { data: existing, error: findErr } = await sb
          .from('events').select('*').eq('category', category).ilike('name', name).limit(1)
        if (findErr) throw findErr
        if (existing?.length) {
          // Backfill the sheet location if we learned it since.
          if (payload.sheet_tab && !existing[0].sheet_tab) {
            await sb.from('events')
              .update({ sheet_tab: payload.sheet_tab, sheet_header: payload.sheet_header ?? name })
              .eq('id', existing[0].id)
          }
          return json({ data: existing[0] })
        }

        const { data, error } = await sb.from('events').insert([{
          name,
          category,
          point_value : Number(payload.point_value) || 0,
          event_date  : payload.event_date ?? null,
          sheet_tab   : payload.sheet_tab ?? null,
          sheet_header: payload.sheet_header ?? name,
        }]).select().single()
        if (error) throw error
        return json({ data })
      }

      case 'bulk_get_or_create_events': {
        const events: any[] = payload.events ?? []
        if (!events.length) return json({ map: {} })

        const bad = events.find(e => !VALID_CATEGORIES.has(String(e.category)))
        if (bad) return json({ error: `Invalid category: ${bad.category}` }, 400)

        const categories = [...new Set(events.map(e => String(e.category)))]
        const { data: existing, error: exErr } = await sb
          .from('events').select('id, name, category').in('category', categories)
        if (exErr) throw exErr

        const map: Record<string, string> = {}
        for (const e of existing ?? []) map[key(e.name, e.category)] = e.id

        const toCreate = events.filter(e => {
          const k = key(e.name, e.category)
          if (map[k]) return false
          map[k] = 'pending'
          return true
        })

        if (toCreate.length) {
          const { data: created, error } = await sb.from('events').insert(
            toCreate.map(e => ({
              name        : String(e.name).trim(),
              category    : String(e.category),
              point_value : Number(e.point_value) || 0,
              event_date  : e.event_date ?? null,
              sheet_tab   : e.sheet_tab ?? null,
              sheet_header: e.sheet_header ?? String(e.name).trim(),
            }))
          ).select('id, name, category')
          if (error) throw error
          for (const e of created ?? []) map[key(e.name, e.category)] = e.id
        }

        for (const k of Object.keys(map)) if (map[k] === 'pending') delete map[k]
        return json({ map })
      }

      // ── Assignments ───────────────────────────────────────────
      case 'upsert_assignment': {
        const { member_id, event_id } = payload
        const points = Number(payload.points_awarded) || 0

        // 0 points means "not awarded" -- remove the row entirely.
        if (points <= 0) {
          const { error } = await sb.from('point_assignments').delete()
            .eq('member_id', member_id).eq('event_id', event_id)
          if (error) throw error
          return json({ ok: true, removed: true })
        }

        const { error } = await sb.from('point_assignments')
          .upsert([{ member_id, event_id, points_awarded: points }], { onConflict: 'member_id,event_id' })
        if (error) throw error
        return json({ ok: true, points })
      }

      case 'delete_assignment': {
        const { error } = await sb.from('point_assignments').delete()
          .eq('member_id', payload.member_id).eq('event_id', payload.event_id)
        if (error) throw error
        return json({ ok: true })
      }

      case 'bulk_upsert_assignments': {
        const rows = (payload.assignments ?? []).filter((a: any) => Number(a.points_awarded) > 0)
        if (!rows.length) return json({ ok: true, count: 0 })
        const { error } = await sb.from('point_assignments')
          .upsert(rows, { onConflict: 'member_id,event_id' })
        if (error) throw error
        return json({ ok: true, count: rows.length })
      }

      /**
       * Make the DB match a whole sheet column exactly.
       * Without this, clearing a cell in the sheet left the points behind
       * in the database forever.
       */
      case 'replace_event_assignments': {
        const eventId = payload.event_id
        const rows    = (payload.assignments ?? []).filter((a: any) => Number(a.points_awarded) > 0)

        if (rows.length) {
          const { error } = await sb.from('point_assignments')
            .upsert(rows.map((a: any) => ({ ...a, event_id: eventId })), { onConflict: 'member_id,event_id' })
          if (error) throw error
        }

        // Work out what to drop by diffing, rather than sending a
        // not-in list of 200 UUIDs in the query string.
        const keep = new Set(rows.map((a: any) => a.member_id))
        const { data: current, error: curErr } = await sb
          .from('point_assignments').select('member_id').eq('event_id', eventId)
        if (curErr) throw curErr

        const stale = (current ?? []).map((r: any) => r.member_id).filter((id: string) => !keep.has(id))
        for (let i = 0; i < stale.length; i += 100) {
          const { error } = await sb.from('point_assignments')
            .delete().eq('event_id', eventId).in('member_id', stale.slice(i, i + 100))
          if (error) throw error
        }

        return json({ ok: true, kept: rows.length, removed: stale.length })
      }

      // ── Maintenance ───────────────────────────────────────────
      case 'recalc_totals': {
        // The trigger keeps this current, but a bulk import can outrun it.
        const { error } = await sb.rpc('recalc_all_member_totals')
        if (error) throw error
        return json({ ok: true })
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error(action, err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
