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
 *  rename_member_row { member_id, old_first, old_last }
 *  remove_member_row { first_name, last_name }
 *                    Roster edits. If the roster is formula-driven (it is
 *                    here) these report where to make the change instead of
 *                    writing, since a write would break the array.
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

// Tabs whose cells hold 1/0 rather than a point value. The sheet applies
// the multiplier itself (BAA does C*18 + D*6 ..., Points in General does
// Conference*12), so writing the point total here would be counted twice
// over -- a 12-point conference would read as 12 conferences attended.
const BINARY_CATEGORIES = new Set(['Conference', 'BAA'])

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
 * Read a whole tab as raw cell content. Formulas come back as their
 * text ("=SUM(C2:R2)"), which is how we detect computed cells.
 */
/**
 * Read a tab twice: once for the values, once for the formulas.
 *
 * FORMULA rendering alone is not enough. Every tab mirrors the roster with
 * an array formula anchored in A2 ("=IF('Points In General'!A2:A1000<>\"\"...)"),
 * and under FORMULA rendering an array's spill cells come back EMPTY -- only
 * the anchor carries text. Matching members on that grid finds nobody.
 *
 * So: `values` is what is actually in the cells, `formulas` is only used to
 * decide whether a cell may be written to.
 */
interface Grid { values: string[][]; formulas: string[][] }

async function readTab(token: string, tab: string): Promise<Grid> {
  const range = encodeURIComponent(`'${tab}'`)
  const [v, f] = await Promise.all([
    api(token, `/values/${range}?valueRenderOption=UNFORMATTED_VALUE`),
    api(token, `/values/${range}?valueRenderOption=FORMULA`),
  ])
  return { values: v.values ?? [], formulas: f.values ?? [] }
}

/** Is this cell computed -- either itself a formula, or inside a spill? */
function computedCell(grid: Grid, row: number, col: number): boolean {
  if (isFormula(grid.formulas[row]?.[col])) return true
  // Spill cells report nothing; the anchor in row 2 gives the column away.
  return isFormula(grid.formulas[1]?.[col])
}

/** Is a whole column produced by a formula (so it must not be written to)? */
function computedColumn(grid: Grid, col: number): boolean {
  return isFormula(grid.formulas[1]?.[col])
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

/** Write several disjoint ranges at once, leaving every other cell alone. */
async function writeRanges(
  token: string,
  data: { range: string; values: (string | number)[][] }[],
  mode: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED',
) {
  if (!data.length) return
  await api(token, '/values:batchUpdate', {
    method: 'POST',
    body  : JSON.stringify({ valueInputOption: mode, data }),
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
function findMemberRow(grid: Grid, firstName: string, lastName: string): number {
  const f = norm(firstName), l = norm(lastName)
  const rows = grid.values
  for (let r = 1; r < rows.length; r++) {
    if (norm(rows[r]?.[0]) === l && norm(rows[r]?.[1]) === f) return r
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
function findHeaderCol(grid: Grid, header: string): number {
  const want    = norm(header)
  const headers = grid.values[0] ?? []
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
    colIdx = (grid.values[0] ?? []).findIndex(h => officer ? /officer/i.test(String(h)) : /general/i.test(String(h)))
    if (colIdx < 0) {
      throw new Error(
        `No ${officer ? 'Officer' : 'General'} meetings column on the "${tab}" tab. ` +
        `Headers: ${(grid.values[0] ?? []).join(' | ')}`
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
    // Binary tabs record attendance as 1/0; the sheet applies the points.
    cellValue = BINARY_CATEGORIES.has(ev.category) ? (points > 0 ? 1 : 0) : points
  }

  // Never clobber a formula -- neither the target cell, nor a cell that is
  // part of an ARRAYFORMULA spilling down from row 2.
  //
  // Only the anchor cell reports as a formula; every cell below it reads back
  // as a plain value, so checking the target alone is not enough. Writing into
  // a spill cell breaks the anchor with #REF! and wipes the column for every
  // member, which is exactly what "Area Conference (November 2025)" and
  // "# General Meetings Attended" would do.
  if (computedCell(grid, rowIdx, colIdx)) {
    const src = grid.formulas[1]?.[colIdx] ?? grid.formulas[rowIdx]?.[colIdx]
    throw new Error(
      `"${tab}" column ${colLetter(colIdx + 1)} ("${grid.values[0]?.[colIdx] ?? '?'}") is ` +
      `computed by a formula (${String(src).slice(0, 80)}...) -- refusing to write to it. ` +
      `Record this one in the spreadsheet, or wherever that formula gets its data.`
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
        const headers = grid.values[0] ?? []

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
        const memberRows = Math.max(0, grid.values.length - 1)
        if (memberRows > 0) {
          await writeRange(token, tab, `${letter}2:${letter}${memberRows + 1}`,
            Array.from({ length: memberRows }, () => [0]))
        }

        /**
         * Widen the subtotal to cover the new column.
         *
         * The column is inserted immediately before the subtotal, i.e. right
         * at the end of a range like SUM(C2:R2). Google only grows a range
         * when you insert INSIDE it, not at its edge -- so without this the
         * new column is scored on the website and ignored by the sheet.
         */
        let subtotalFixed = 0
        if (subtotalIdx >= 0 && memberRows > 0) {
          const newSubIdx = subtotalIdx + 1                 // it shifted right
          const template  = grid.formulas[1]?.[subtotalIdx] // formula before the insert
          const lastEvent = colLetter(newSubIdx)            // the column just added

          if (isFormula(template)) {
            const body = String(template)
            const data: { range: string; values: (string | number)[][] }[] = []
            for (let r = 2; r <= memberRows + 1; r++) {
              // Re-point the template at this row, then extend it.
              const rowFormula = body.replace(/(?<=[A-Z]\$?)2\b/g, String(r))
              const widened = /^=?\s*SUM\(/i.test(rowFormula)
                // plain sum: stretch the end of the range to the new column
                ? rowFormula.replace(/:\s*\$?[A-Z]+\$?\d+\s*\)/, `:${lastEvent}${r})`)
                // weighted (BAA): add the new column at its own point value
                : `${rowFormula} + ${lastEvent}${r}*${ev.point_value ?? 0}`
              data.push({
                range : `'${tab}'!${colLetter(newSubIdx + 1)}${r}`,
                values: [[widened.startsWith('=') ? widened : `=${widened}`]],
              })
            }
            await writeRanges(token, data, 'USER_ENTERED')
            subtotalFixed = data.length
          }
        }

        await sb.from('events').update({ sheet_tab: tab, sheet_header: ev.name }).eq('id', ev.id)
        return json({ ok: true, existed: false, tab, col: letter, subtotalRowsUpdated: subtotalFixed })
      }

      /**
       * ── Member roster operations ──────────────────────────────
       *
       * The roster is not editable through this function. Every tab mirrors
       * "Points In General" columns A/B with an array formula, and those in
       * turn come from an ARRAYFORMULA + IMPORTRANGE against a separate
       * spreadsheet. Writing a name anywhere would overwrite an array and
       * break the roster on every tab at once.
       *
       * So these actions report what they found instead of writing, and the
       * caller surfaces it. Members still get created/renamed/deleted in the
       * database -- only the spreadsheet side is out of our hands.
       */
      case 'add_member_row':
      case 'rename_member_row':
      case 'remove_member_row': {
        const master = resolveTab(tabs, 'Miscellaneous')       // "Points In General"
        const grid   = await readTab(token, master)

        if (computedColumn(grid, 0) || computedColumn(grid, 1)) {
          const src = String(grid.formulas[1]?.[0] ?? '')
          const m   = src.match(/IMPORTRANGE\(\s*"?([-\w]{20,})"?/i)
                   ?? src.match(/["']([-\w]{30,})["']/)
          return json({
            ok       : false,
            managed  : 'formula',
            tab      : master,
            sourceId : m?.[1] ?? null,
            error    :
              `The "${master}" roster is generated by a formula, and every other tab mirrors it, ` +
              `so the roster cannot be edited from here.` +
              (m?.[1]
                ? ` It is imported from spreadsheet ${m[1]} — add, rename or remove the person there ` +
                  `and the sheet will follow.`
                : ` Edit it at whatever source that formula imports from.`),
          }, 200)
        }

        // Roster is plain values after all -- edit the master; mirrors follow.
        const first = String(body.first_name ?? '').trim()
        const last  = String(body.last_name ?? '').trim()

        if (action === 'remove_member_row') {
          const rowIdx = findMemberRow(grid, first, last)
          if (rowIdx < 0) return json({ ok: true, skipped: 'not present' })
          const sheetId = tabs.find(t => t.title === master)!.sheetId
          await api(token, ':batchUpdate', {
            method: 'POST',
            body  : JSON.stringify({ requests: [{ deleteDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
            } }] }),
          })
          return json({ ok: true, tab: master, deletedRow: rowIdx + 1 })
        }

        const { data: m2, error: mErr } = await sb
          .from('members').select('first_name, last_name, name, grade').eq('id', body.member_id).single()
        if (mErr) throw new Error(`Member not found: ${mErr.message}`)
        const fName = (m2.first_name ?? '').trim()
        const lName = (m2.last_name ?? '').trim()

        if (action === 'rename_member_row') {
          const rowIdx = findMemberRow(grid, body.old_first, body.old_last)
          if (rowIdx < 0) return json({ ok: true, skipped: 'not present' })
          await writeRanges(token, [{
            range: `'${master}'!A${rowIdx + 1}:B${rowIdx + 1}`, values: [[lName, fName]],
          }], 'RAW')
          return json({ ok: true, tab: master, row: rowIdx + 1 })
        }

        // add_member_row
        if (findMemberRow(grid, fName, lName) >= 0) {
          return json({ ok: true, skipped: 'already present', tab: master })
        }
        const newRow  = grid.values.length + 1
        const headers = grid.values[0] ?? []
        const data: { range: string; values: (string | number)[][] }[] = [
          { range: `'${master}'!A${newRow}:B${newRow}`, values: [[lName, fName]] },
        ]
        const gradeCol = headers.findIndex(h => /grade/i.test(String(h)))
        if (gradeCol >= 0 && m2.grade != null && !computedColumn(grid, gradeCol)) {
          data.push({ range: `'${master}'!${colLetter(gradeCol + 1)}${newRow}`, values: [[m2.grade]] })
        }
        // Carry per-row formulas (subtotals) down, but never touch a spill column.
        const template = grid.formulas[grid.values.length - 1] ?? []
        for (let c = 2; c < headers.length; c++) {
          if (computedColumn(grid, c)) continue
          const t = template[c]
          if (!isFormula(t)) continue
          data.push({
            range : `'${master}'!${colLetter(c + 1)}${newRow}`,
            values: [[String(t).replace(new RegExp(`(?<=[A-Z]\\$?)${grid.values.length}\\b`, 'g'), String(newRow))]],
          })
        }
        await writeRanges(token, data, 'USER_ENTERED')
        return json({ ok: true, tab: master, row: newRow, cells: data.length })
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
              rows          : Math.max(0, grid.values.length - 1),
              headers       : (grid.values[0] ?? []).map(String),
              formulaColumns: (grid.formulas[1] ?? [])
                .map((c, i) => (isFormula(c) ? String((grid.values[0] ?? [])[i] ?? colLetter(i + 1)) : null))
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
