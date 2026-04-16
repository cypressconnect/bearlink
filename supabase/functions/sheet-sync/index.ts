/**
 * Supabase Edge Function: sheet-sync
 *
 * Acts as a secure proxy for Google Apps Script writes.
 * The Apps Script sends a shared secret header — this function
 * validates it, then uses the service role key (stored as a Supabase
 * secret) to perform DB writes. The service role key never leaves
 * this server-side function.
 *
 * ── Setup ────────────────────────────────────────────────────────
 * 1. Generate a random secret string (e.g. a UUID or 32-char hex).
 *
 * 2. Store it in Supabase (Dashboard → Edge Functions → Secrets):
 *    SHEET_SYNC_SECRET  — your random secret string
 *
 * 3. Deploy:
 *    supabase functions deploy sheet-sync --no-verify-jwt
 *
 * 4. Store the same secret in Apps Script (run setSheetSyncSecret()
 *    once from the Apps Script editor).
 *
 * ── Actions ──────────────────────────────────────────────────────
 * get_or_create_event       { name, category, point_value }
 * bulk_get_or_create_events { events: [{name, category, point_value}] }
 * upsert_assignment         { member_id, event_id, points_awarded }
 * delete_assignment         { member_id, event_id }
 * create_members            { members: [{name, first_name, last_name, grade}] }
 * bulk_upsert_assignments   { assignments: [{member_id, event_id, points_awarded}] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SYNC_SECRET   = Deno.env.get('SHEET_SYNC_SECRET')!

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  // ── Auth: validate shared secret ─────────────────────────────
  if (req.headers.get('x-sheet-secret') !== SYNC_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { action, ...payload } = body
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    switch (action) {

      // ── Find or create a single event ───────────────────────
      case 'get_or_create_event': {
        const { name, category, point_value } = payload

        const { data: existing } = await sb
          .from('events')
          .select('*')
          .eq('name', name)
          .eq('category', category)
          .limit(1)

        if (existing && existing.length > 0) return json({ data: existing[0] })

        const { data, error } = await sb
          .from('events')
          .insert([{ name, category, point_value: point_value ?? 0 }])
          .select()
          .single()

        if (error) throw error
        return json({ data })
      }

      // ── Find or create a batch of events, return name→id map ─
      case 'bulk_get_or_create_events': {
        const events: { name: string; category: string; point_value: number }[] = payload.events ?? []
        if (events.length === 0) return json({ map: {} })

        // Fetch all existing events for the categories involved
        const categories = [...new Set(events.map(e => e.category))]
        const { data: existing } = await sb
          .from('events')
          .select('id, name, category')
          .in('category', categories)

        const existingMap: Record<string, string> = {}
        for (const e of existing ?? []) {
          existingMap[`${e.name.toLowerCase()}|${e.category}`] = e.id
        }

        // Create any missing events
        const toCreate = events.filter(
          e => !existingMap[`${e.name.toLowerCase()}|${e.category}`]
        )
        if (toCreate.length > 0) {
          const { data: created, error } = await sb
            .from('events')
            .insert(toCreate.map(e => ({ name: e.name, category: e.category, point_value: e.point_value ?? 0 })))
            .select('id, name, category')
          if (error) throw error
          for (const e of created ?? []) {
            existingMap[`${e.name.toLowerCase()}|${e.category}`] = e.id
          }
        }

        return json({ map: existingMap })
      }

      // ── Upsert a single point_assignment ────────────────────
      case 'upsert_assignment': {
        const { member_id, event_id, points_awarded } = payload
        const { error } = await sb
          .from('point_assignments')
          .upsert([{ member_id, event_id, points_awarded }], { onConflict: 'member_id,event_id' })
        if (error) throw error
        return json({ ok: true })
      }

      // ── Delete a single point_assignment ────────────────────
      case 'delete_assignment': {
        const { member_id, event_id } = payload
        const { error } = await sb
          .from('point_assignments')
          .delete()
          .eq('member_id', member_id)
          .eq('event_id', event_id)
        if (error) throw error
        return json({ ok: true })
      }

      // ── Bulk insert new members ──────────────────────────────
      case 'create_members': {
        const members: any[] = payload.members ?? []
        if (members.length === 0) return json({ ok: true, count: 0 })
        const { error } = await sb.from('members').insert(members)
        if (error) throw error
        return json({ ok: true, count: members.length })
      }

      // ── Bulk upsert point_assignments (for initial import) ───
      case 'bulk_upsert_assignments': {
        const assignments: any[] = payload.assignments ?? []
        if (assignments.length === 0) return json({ ok: true })
        const { error } = await sb
          .from('point_assignments')
          .upsert(assignments, { onConflict: 'member_id,event_id' })
        if (error) throw error
        return json({ ok: true, count: assignments.length })
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
