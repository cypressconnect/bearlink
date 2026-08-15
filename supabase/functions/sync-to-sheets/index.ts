/**
 * Supabase Edge Function: sync-to-sheets   (website -> Google Sheet)
 *
 * Deploy:  supabase functions deploy sync-to-sheets
 *
 * Every action requires a signed-in admin (the caller's JWT is checked
 * against admin_profiles). The Google service-account credentials and the
 * service-role key never leave this function.
 *
 * ── Actions ──────────────────────────────────────────────────────────
 *  write_points      { member_id, event_id }              default action
 *                    Writes the member's current points for that event
 *                    into the right cell. Reads the value from the DB so
 *                    the sheet can never disagree with the DB.
 *  add_event_column  { event_id }
 *                    Inserts a new column (before the subtotal column) on
 *                    the event's tab, headed with the event name, and
 *                    zero-fills every member row.
 *  add_member_row    { member_id }
 *                    Appends the member to every roster tab, zero-filling
 *                    the data columns and leaving formula columns alone.
 *  remove_member_row { last_name, first_name }
 *  rename_event      { event_id, old_header }
 *  resync_member     { member_id }        push all of one member's points
 *  health            {}                   report tab/roster/formula status
 *
 * ── Safety rules this function enforces ──────────────────────────────
 *  * It never overwrites a cell containing a formula. The sheet's
 *    subtotal and "... Formula" columns stay intact.
 *  * Tab names are resolved by fuzzy match, so renaming "Services" to
 *    "Service Projects" in the sheet does not break the sync.
 *  * Attendance counts are SET (points / 2), never incremented -- the old
 *    version added 1 on every call, including deletes.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SA_EMAIL     = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!
const SA_KEY       = Deno.env.get('GOOGLE_PRIVATE_KEY')!.replace(/\\n/g, '\n')
const SHEET_ID     = Deno.env.get('GOOGLE_SHEET_ID')!

// ── Category -> candidate tab names (first match wins) ────────────────
const TAB_ALIASES: Record<string, string[]> = {
  Service      : ['Services', 'Service', 'Service Projects'],
  Fundraising  : ['Fundraising', 'Fundraisers', 'Fundraiser'],
  Social       : ['Social', 'Socials', 'Social Events'],
  Conference   : ['Conferences', 'Conference'],
  BAA          : ['BAA', 'BAAs', 'Business Achievement Awards'],
  Attendance   : ['Attendance'],
  Committee    : ['Committee Meetings', 'Committee', 'Committees'],
  Miscellaneous: ['Points in General', 'General Points', 'Points'],
}

// Points awarded per meeting attended (Attendance tab stores a COUNT).
const POINTS_PER_MEETING = 2

// A header that matches this is a computed subtotal -- never an event.
const SUBTOTAL_RE = /^(total|sum|#|points\s+for)|formula$|\((x)?\d+x?\)$/i

// ── base64url (for the service-account JWT) ───────────────────────────
const b64url      = (s: string)      => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlBytes = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

let cachedToken: { value: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value

  const now   = Math.floor(Date.now() / 1000)
  const claim = {
    iss  : SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud  : 'https://oauth2.googleapis.com/token',
    exp  : now + 3600,
    iat  : now,
  }
  const sigInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claim))}`
  const key      = await importPrivateKey(SA_KEY)
  const sig      = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput))
  const jwt      = `${sigInput}.${b64urlBytes(sig)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const body = await resp.json()
  if (!body.access_token) throw new Error(`Google token exchange failed: ${JSON.stringify(body)}`)

  cachedToken = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

// ── Sheets REST helpers ───────────────────────────────────────────────
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`

function colLetter(n: number): string {           // 1 -> A
  let s = ''
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
  return s
}

/** Normalise a header/tab/name for tolerant comparison. */
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

async function api(token: string, path: string, init: RequestInit = {}) {
  const resp = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`Sheets API ${resp.status} on ${path}: ${text}`)
  return text ? JSON.parse(text) : {}
}

/** Every tab's title + numeric id. */
async function listTabs(token: string): Promise<{ title: string; sheetId: number }[]> {
  const data = await api(token, '?fields=sheets.properties')
  return (data.sheets ?? []).map((s: any) => ({ title: s.properties.title, sheetId: s.properties.sheetId }))
}

/**
 * Pick the real tab for a category. Tries each alias exactly, then
 * normalised, then any tab whose normalised title contains the alias.
 */
function resolveTab(tabs: { title: string }[], category: string): string {
  const aliases = TAB_ALIASES[category] ?? [category]
  for (const a of aliases) {
    const exact = tabs.find(t => t.title === a); if (exact) return exact.title
  }
  for (const a of aliases) {
    const ci = tabs.find(t => norm(t.title) === norm(a)); if (ci) return ci.title
  }
  for (const a of aliases) {
    const partial = tabs.find(t => norm(t.title).includes(norm(a))); if (partial) return partial.title
  }
  throw new Error(
    `No tab found for category "${category}". Looked for: ${aliases.join(', ')}. ` +
    `Tabs in this spreadsheet: ${tabs.map(t => t.title).join(', ')}`
  )
}

/**
 * Every tab that carries a Last Name / First Name roster, de-duplicated.
 * Several categories share a tab (Miscellaneous and Other both live on
 * "Points in General"), so this must not return the same tab twice.
 */
function allRosterTabs(tabs: { title: string }[]): string[] {
  const titles = new Set<string>()
  for (const category of Object.keys(TAB_ALIASES)) {
    try { titles.add(resolveTab(tabs, category)) } catch { /* tab absent */ }
  }
  return [...titles]
}

/**
 * Read a whole tab as raw cell content. Formulas come back as their
 * text ("=SUM(C2:R2)"), which is how we detect computed cells.
 */
async function readTab(token: string, tab: string): Promise<string[][]> {
  const data = await api(token, `/values/${encodeURIComponent(`'${tab}'`)}?valueRenderOption=FORMULA`)
  return data.values ?? []
}

async function writeCell(token: string, tab: string, a1: string, value: string | number) {
  await api(token, `/values/${encodeURIComponent(`'${tab}'!${a1}`)}?valueInputOption=RAW`, {
    method: 'PUT', body: JSON.stringify({ values: [[value]] }),
  })
}

/**
 * `mode` matters: RAW stores what you send verbatim, so a formula string
 * would land as literal text. Use USER_ENTERED whenever the payload can
 * contain formulas (copying a template row for a new member).
 */
async function writeRange(
  token: string, tab: string, a1: string,
  values: (string | number)[][], mode: 'RAW' | 'USER_ENTERED' = 'RAW',
) {
  await api(token, `/values/${encodeURIComponent(`'${tab}'!${a1}`)}?valueInputOption=${mode}`, {
    method: 'PUT', body: JSON.stringify({ values }),
  })
}

async function insertColumn(token: string, sheetId: number, colIndex: number) {
  await api(token, ':batchUpdate', {
    method: 'POST',
    body  : JSON.stringify({
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: colIndex, endIndex: colIndex + 1 },
          inheritFromBefore: false,
        },
      }],
    }),
  })
}

const isFormula = (cell: unknown) => typeof cell === 'string' && cell.trim().startsWith('=')

/** Row index (0-based, into the grid) of a member on a tab. */
function findMemberRow(grid: string[][], firstName: string, lastName: string): number {
  const f = norm(firstName), l = norm(lastName)
  for (let r = 1; r < grid.length; r++) {
    if (norm(grid[r]?.[0]) === l && norm(grid[r]?.[1]) === f) return r
  }
  return -1
}

/**
 * Column index (0-based) of a header on a tab.
 *
 * Exact (normalised) match wins. A loose match is only accepted when it is
 * unambiguous -- otherwise "SilverCrest" would silently land in the
 * "Silvercrest 9/5" column, which is exactly the kind of quiet mis-write
 * that put the sheet and the site out of step.
 */
function findHeaderCol(grid: string[][], header: string): number {
  const want    = norm(header)
  const headers = grid[0] ?? []
  if (!want) return -1

  for (let c = 2; c < headers.length; c++) if (norm(headers[c]) === want) return c

  const loose: number[] = []
  for (let c = 2; c < headers.length; c++) {
    const h = norm(headers[c])
    if (h && (h.includes(want) || want.includes(h))) loose.push(c)
  }
  if (loose.length === 1) return loose[0]
  if (loose.length > 1) {
    throw new Error(
      `"${header}" matches ${loose.length} columns (` +
      loose.map(c => `"${headers[c]}"`).join(', ') +
      `). Rename the event to match one column exactly.`
    )
  }
  return -1
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Caller must be a signed-in admin ──────────────────────────────────
async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const jwt  = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) throw new Response('Missing Authorization header', { status: 401 })

  const admin  = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: { user }, error } = await admin.auth.getUser(jwt)
  if (error || !user) throw new Response('Invalid session', { status: 401 })

  const { data: profile } = await admin
    .from('admin_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!profile) throw new Response('Admin access required', { status: 403 })

  return admin
}

// ── Core: write one member's points for one event into the sheet ──────
async function writePoints(sb: any, token: string, tabs: any[], memberId: string, eventId: string) {
  const { data: ev, error: evErr } = await sb
    .from('events').select('id, name, category, sheet_tab, sheet_header').eq('id', eventId).single()
  if (evErr) throw new Error(`Event ${eventId} not found: ${evErr.message}`)

  const { data: member, error: mErr } = await sb
    .from('members').select('first_name, last_name, name').eq('id', memberId).single()
  if (mErr) throw new Error(`Member ${memberId} not found: ${mErr.message}`)

  const firstName = (member.first_name ?? member.name?.split(' ')[0] ?? '').trim()
  const lastName  = (member.last_name ?? member.name?.split(' ').slice(1).join(' ') ?? '').trim()

  // Read the authoritative value straight from the DB.
  const { data: pa } = await sb
    .from('point_assignments').select('points_awarded')
    .eq('member_id', memberId).eq('event_id', eventId).maybeSingle()
  const points = pa?.points_awarded ?? 0

  const tab  = ev.sheet_tab && tabs.some(t => t.title === ev.sheet_tab)
    ? ev.sheet_tab
    : resolveTab(tabs, ev.category)
  const grid = await readTab(token, tab)

  const rowIdx = findMemberRow(grid, firstName, lastName)
  if (rowIdx < 0) {
    throw new Error(`"${firstName} ${lastName}" has no row on the "${tab}" tab. Run add_member_row first.`)
  }

  // Attendance stores a COUNT of meetings, not a point total.
  let colIdx: number
  let cellValue: number
  if (ev.category === 'Attendance') {
    const officer = /officer/i.test(ev.name)
    const general = /general/i.test(ev.name)
    if (!officer && !general) {
      throw new Error(
        `"${ev.name}" is in the Attendance category but the tab only has General and Officer ` +
        `meeting columns. Rename it to include "General" or "Officer", or move it to ` +
        `Miscellaneous so it gets its own column.`
      )
    }
    colIdx = (grid[0] ?? []).findIndex(h => officer ? /officer/i.test(String(h)) : /general/i.test(String(h)))
    if (colIdx < 0) {
      throw new Error(
        `No ${officer ? 'Officer' : 'General'} meetings column on the "${tab}" tab. ` +
        `Headers: ${(grid[0] ?? []).join(' | ')}`
      )
    }
    cellValue = Math.round(points / POINTS_PER_MEETING)
  } else {
    colIdx = findHeaderCol(grid, ev.sheet_header || ev.name)
    if (colIdx < 0) {
      throw new Error(
        `No column named "${ev.sheet_header || ev.name}" on the "${tab}" tab. ` +
        `Create it from the dashboard (Add Event) or add the column by hand.`
      )
    }
    cellValue = points
  }

  // Never clobber a formula.
  if (isFormula(grid[rowIdx]?.[colIdx])) {
    throw new Error(
      `"${tab}"!${colLetter(colIdx + 1)}${rowIdx + 1} contains a formula ` +
      `(${grid[rowIdx][colIdx]}) -- refusing to overwrite it. ` +
      `That column is computed by the sheet, so it should not be an event.`
    )
  }

  const a1 = `${colLetter(colIdx + 1)}${rowIdx + 1}`
  await writeCell(token, tab, a1, cellValue)
  return { tab, cell: a1, value: cellValue }
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let sb: any
  try {
    sb = await requireAdmin(req)
  } catch (r) {
    if (r instanceof Response) {
      return json({ ok: false, error: await r.text() }, r.status)
    }
    return json({ ok: false, error: String(r) }, 401)
  }

  try {
    const body   = await req.json()
    const action = body.action ?? 'write_points'
    const token  = await getToken()
    const tabs   = await listTabs(token)

    switch (action) {

      // ── Push one member's points for one event ────────────────
      case 'write_points': {
        const result = await writePoints(sb, token, tabs, body.member_id, body.event_id)
        return json({ ok: true, ...result })
      }

      // ── Push every point a member has ─────────────────────────
      case 'resync_member': {
        const { data: rows } = await sb
          .from('point_assignments').select('event_id').eq('member_id', body.member_id)
        const results: any[] = []
        for (const r of rows ?? []) {
          try {
            results.push({ event_id: r.event_id, ...await writePoints(sb, token, tabs, body.member_id, r.event_id) })
          } catch (e) {
            results.push({ event_id: r.event_id, error: String(e) })
          }
        }
        return json({ ok: true, synced: results.length, results })
      }

      // ── Add a column for a brand-new event ────────────────────
      case 'add_event_column': {
        const { data: ev, error } = await sb
          .from('events').select('id, name, category, sheet_tab, sheet_header').eq('id', body.event_id).single()
        if (error) throw new Error(`Event not found: ${error.message}`)

        // Attendance uses two fixed columns -- nothing to add.
        if (ev.category === 'Attendance') {
          return json({ ok: true, skipped: true, reason: 'Attendance uses fixed General/Officer columns' })
        }

        const tab     = resolveTab(tabs, ev.category)
        const sheetId = tabs.find(t => t.title === tab)!.sheetId
        const grid    = await readTab(token, tab)
        const headers = grid[0] ?? []

        const existing = findHeaderCol(grid, ev.name)
        if (existing >= 0) {
          await sb.from('events')
            .update({ sheet_tab: tab, sheet_header: String(headers[existing]) }).eq('id', ev.id)
          return json({ ok: true, existed: true, tab, col: colLetter(existing + 1) })
        }

        // Insert before the first subtotal column so totals stay on the right.
        const subtotalIdx = headers.findIndex((h, i) => i >= 2 && SUBTOTAL_RE.test(String(h).trim()))
        let colIdx: number
        if (subtotalIdx >= 0) {
          await insertColumn(token, sheetId, subtotalIdx)
          colIdx = subtotalIdx
        } else {
          colIdx = headers.length
        }

        const letter = colLetter(colIdx + 1)
        await writeCell(token, tab, `${letter}1`, ev.name)

        // Zero-fill the member rows (skip any that are formulas).
        const memberRows = Math.max(0, grid.length - 1)
        if (memberRows > 0) {
          await writeRange(token, tab, `${letter}2:${letter}${memberRows + 1}`,
            Array.from({ length: memberRows }, () => [0]))
        }

        await sb.from('events').update({ sheet_tab: tab, sheet_header: ev.name }).eq('id', ev.id)
        return json({ ok: true, existed: false, tab, col: letter })
      }

      // ── Append a new member to every roster tab ───────────────
      case 'add_member_row': {
        const { data: m, error } = await sb
          .from('members').select('first_name, last_name, name, grade').eq('id', body.member_id).single()
        if (error) throw new Error(`Member not found: ${error.message}`)

        const firstName = (m.first_name ?? m.name?.split(' ')[0] ?? '').trim()
        const lastName  = (m.last_name ?? m.name?.split(' ').slice(1).join(' ') ?? '').trim()

        const rosterTabs = allRosterTabs(tabs)

        const touched: any[] = []
        for (const tab of rosterTabs) {
          try {
            const grid = await readTab(token, tab)
            if (!grid.length) { touched.push({ tab, skipped: 'empty tab' }); continue }

            if (findMemberRow(grid, firstName, lastName) >= 0) {
              touched.push({ tab, skipped: 'already present' }); continue
            }

            const headers  = grid[0] ?? []
            const newRow   = grid.length + 1                 // 1-based sheet row
            const template = grid[grid.length - 1] ?? []     // copy formulas from the last row

            const values: (string | number)[] = headers.map((h, c) => {
              if (c === 0) return lastName
              if (c === 1) return firstName
              if (/grade/i.test(String(h))) return m.grade ?? ''
              // Re-point any formula in the template row at the new row.
              const t = template[c]
              if (isFormula(t)) return String(t).replace(new RegExp(`(?<=[A-Z]\\$?)${grid.length}\\b`, 'g'), String(newRow))
              return 0
            })

            await writeRange(token, tab, `A${newRow}:${colLetter(values.length)}${newRow}`, [values], 'USER_ENTERED')
            touched.push({ tab, row: newRow })
          } catch (e) {
            touched.push({ tab, error: String(e) })
          }
        }
        return json({ ok: true, member: `${firstName} ${lastName}`, tabs: touched })
      }

      // ── Clear a member's row across all tabs ──────────────────
      case 'remove_member_row': {
        const { first_name, last_name } = body
        const rosterTabs = allRosterTabs(tabs)

        const touched: any[] = []
        for (const tab of rosterTabs) {
          try {
            const grid   = await readTab(token, tab)
            const rowIdx = findMemberRow(grid, first_name, last_name)
            if (rowIdx < 0) { touched.push({ tab, skipped: 'not present' }); continue }
            const sheetId = tabs.find(t => t.title === tab)!.sheetId
            await api(token, ':batchUpdate', {
              method: 'POST',
              body  : JSON.stringify({
                requests: [{ deleteDimension: {
                  range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
                } }],
              }),
            })
            touched.push({ tab, deletedRow: rowIdx + 1 })
          } catch (e) {
            touched.push({ tab, error: String(e) })
          }
        }
        return json({ ok: true, tabs: touched })
      }

      // ── Rename an event's column header ──────────────────────
      case 'rename_event': {
        const { data: ev, error } = await sb
          .from('events').select('id, name, category, sheet_tab').eq('id', body.event_id).single()
        if (error) throw new Error(`Event not found: ${error.message}`)

        const tab    = ev.sheet_tab && tabs.some(t => t.title === ev.sheet_tab) ? ev.sheet_tab : resolveTab(tabs, ev.category)
        const grid   = await readTab(token, tab)
        const colIdx = findHeaderCol(grid, body.old_header ?? ev.name)
        if (colIdx < 0) return json({ ok: true, skipped: true, reason: 'column not found' })

        await writeCell(token, tab, `${colLetter(colIdx + 1)}1`, ev.name)
        await sb.from('events').update({ sheet_tab: tab, sheet_header: ev.name }).eq('id', ev.id)
        return json({ ok: true, tab, col: colLetter(colIdx + 1) })
      }

      // ── Diagnostics ───────────────────────────────────────────
      case 'health': {
        const report: any = { spreadsheet_tabs: tabs.map(t => t.title), categories: {} }
        for (const cat of Object.keys(TAB_ALIASES)) {
          try {
            const tab  = resolveTab(tabs, cat)
            const grid = await readTab(token, tab)
            report.categories[cat] = {
              tab,
              rows          : Math.max(0, grid.length - 1),
              headers       : (grid[0] ?? []).map(String),
              formulaColumns: (grid[1] ?? [])
                .map((c, i) => (isFormula(c) ? String((grid[0] ?? [])[i] ?? colLetter(i + 1)) : null))
                .filter(Boolean),
            }
          } catch (e) {
            report.categories[cat] = { error: String(e) }
          }
        }
        const { count: memberCount } = await sb.from('members').select('id', { count: 'exact', head: true })
        const { count: eventCount }  = await sb.from('events').select('id', { count: 'exact', head: true })
        report.database = { members: memberCount, events: eventCount }
        return json({ ok: true, report })
      }

      default:
        return json({ ok: false, error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error(err)
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
