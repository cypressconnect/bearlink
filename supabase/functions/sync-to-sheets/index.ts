/**
 * Supabase Edge Function: sync-to-sheets
 *
 * Updates a single cell in the relevant Google Sheet tab when a
 * point assignment is edited or deleted from the admin UI.
 *
 * POST body: { member_id, category, event_name, value }
 *   - category : 'Service' | 'Fundraising' | 'Social' | 'Conference' | 'BAA' | 'Attendance'
 *   - value    : new points_awarded (0 = deleted / cleared)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SA_EMAIL     = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!
const SA_KEY       = Deno.env.get('GOOGLE_PRIVATE_KEY')!.replace(/\\n/g, '\n')
const SHEET_ID     = Deno.env.get('GOOGLE_SHEET_ID')!

// ── Category → Sheet tab name ─────────────────────────────────
const TAB: Record<string, string> = {
  Service:               'Services',
  Fundraising:           'Fundraising',
  Social:                'Social',
  Conference:            'Conferences',
  BAA:                   'BAA',
  Attendance:            'Attendance',
  'Attendance - General': 'Attendance',
  'Attendance - Officer': 'Attendance',
}

// ── base64URL (required for JWT) ──────────────────────────────
const b64url      = (s: string)      => btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const b64urlBytes = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

// ── Google Service Account JWT auth ──────────────────────────
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der  = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
}

async function getToken(): Promise<string> {
  const now   = Math.floor(Date.now() / 1000)
  const claim = {
    iss  : SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud  : 'https://oauth2.googleapis.com/token',
    exp  : now + 3600,
    iat  : now,
  }
  const header   = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload  = b64url(JSON.stringify(claim))
  const sigInput = `${header}.${payload}`
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
  return body.access_token
}

// ── Sheets helpers ────────────────────────────────────────────
function colLetter(n: number): string {
  let s = ''
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
  return s
}

async function sheetsGet(token: string, range: string): Promise<string[][]> {
  const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`Sheets read error on "${range}": ${JSON.stringify(data)}`)
  return data.values ?? []
}

async function sheetsSet(token: string, range: string, value: string | number): Promise<void> {
  const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
  const resp = await fetch(url, {
    method : 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body   : JSON.stringify({ values: [[value]] }),
  })
  if (!resp.ok) throw new Error(`Sheets write error on "${range}": ${await resp.text()}`)
}

async function sheetsSetColumn(token: string, range: string, values: (string | number)[][]): Promise<void> {
  const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
  const resp = await fetch(url, {
    method : 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body   : JSON.stringify({ values }),
  })
  if (!resp.ok) throw new Error(`Sheets range write error on "${range}": ${await resp.text()}`)
}

async function getSheetId(token: string, tabName: string): Promise<number> {
  const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await resp.json()
  if (!resp.ok) throw new Error(`Sheets metadata error: ${JSON.stringify(data)}`)
  const sheet = (data.sheets ?? []).find((s: any) => s.properties.title === tabName)
  if (!sheet) throw new Error(`Tab "${tabName}" not found in spreadsheet`)
  return sheet.properties.sheetId
}

async function sheetsInsertColumn(token: string, sheetId: number, colIndex: number): Promise<void> {
  const url  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`
  const resp = await fetch(url, {
    method : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body   : JSON.stringify({
      requests: [{
        insertDimension: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: colIndex, endIndex: colIndex + 1 },
          inheritFromBefore: false,
        }
      }]
    }),
  })
  if (!resp.ok) throw new Error(`Sheets insertDimension error: ${await resp.text()}`)
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()

    // ── New action: add a column for a newly created event ───────
    if (body.action === 'add_event_column') {
      const { category, event_name } = body
      const tab = TAB[category]
      // Attendance uses fixed columns — no event column to add
      if (!tab || category === 'Attendance' || category === 'Attendance - General' || category === 'Attendance - Officer') {
        return json({ ok: true, skipped: true, reason: `No column to add for category: ${category}` })
      }

      const token = await getToken()

      // Read header row
      const headers = (await sheetsGet(token, `'${tab}'!1:1`))[0] ?? []

      // Already exists — nothing to do
      let colIdx = headers.findIndex(h => h.trim().toLowerCase() === event_name.trim().toLowerCase())
      if (colIdx >= 0) return json({ ok: true, col: colLetter(colIdx + 1), existed: true })

      // Find first total/summary column (same pattern as Apps Script)
      const totalIdx = headers.findIndex(h => /^(total|sum|#|points\s+for)/i.test(h.trim()))

      if (totalIdx >= 0) {
        // Insert a physical column before the total so the total stays at the end
        const sheetId = await getSheetId(token, tab)
        await sheetsInsertColumn(token, sheetId, totalIdx) // totalIdx is 0-based
        colIdx = totalIdx
      } else {
        // No total column — append at the end
        colIdx = headers.length
      }

      const newColLetter = colLetter(colIdx + 1)

      // Write the event name as the header
      await sheetsSet(token, `'${tab}'!${newColLetter}1`, event_name)

      // Fill 0 for every existing member row (row 2 onwards)
      const nameRows = await sheetsGet(token, `'${tab}'!A:A`)
      const memberCount = Math.max(0, nameRows.length - 1)
      if (memberCount > 0) {
        const zeroValues = Array.from({ length: memberCount }, () => [0])
        const fillRange  = `'${tab}'!${newColLetter}2:${newColLetter}${memberCount + 1}`
        await sheetsSetColumn(token, fillRange, zeroValues)
      }

      return json({ ok: true, col: newColLetter, existed: false })
    }

    // ── Action: sync total points to "Top 50 Members" tab ────────
    if (body.action === 'sync_total') {
      const { member_id, total } = body

      const sb = createClient(SUPABASE_URL, SERVICE_KEY)
      const { data: member, error: me } = await sb
        .from('members').select('name, first_name, last_name').eq('id', member_id).single()
      if (me) throw me

      const firstName = (member.first_name ?? member.name?.split(' ')[0] ?? '').trim()
      const lastName  = (member.last_name  ?? member.name?.split(' ').slice(1).join(' ') ?? '').trim()

      const token = await getToken()

      // Find the member row by Last Name (col E) and First Name (col F)
      const nameRows = await sheetsGet(token, "'Top 50 Members'!E:F")
      let rowIdx = -1
      for (let i = 1; i < nameRows.length; i++) {
        const rLast  = (nameRows[i][0] ?? '').trim().toLowerCase()
        const rFirst = (nameRows[i][1] ?? '').trim().toLowerCase()
        if (rLast === lastName.toLowerCase() && rFirst === firstName.toLowerCase()) {
          rowIdx = i; break
        }
      }

      // Member may not be in the tab yet — skip gracefully
      if (rowIdx < 0) return json({ ok: true, skipped: true, reason: `Member "${firstName} ${lastName}" not found in Top 50 Members tab` })

      const cellRef = `'Top 50 Members'!G${rowIdx + 1}`
      await sheetsSet(token, cellRef, total)
      return json({ ok: true, cell: cellRef, value: total })
    }

    // ── Original action: update a single cell for an assignment ──
    const { member_id, category, event_name, value } = body

    const tab = TAB[category]
    if (!tab) return json({ error: `Unknown category: ${category}` }, 400)

    // Look up member name
    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: member, error: me } = await sb
      .from('members').select('name, first_name, last_name').eq('id', member_id).single()
    if (me) throw me

    const firstName = (member.first_name ?? member.name?.split(' ')[0] ?? '').trim()
    const lastName  = (member.last_name  ?? member.name?.split(' ').slice(1).join(' ') ?? '').trim()

    const token = await getToken()

    // ── Attendance: find General/Officer columns by header name ────
    if (category === 'Attendance' || category === 'Attendance - General' || category === 'Attendance - Officer') {
      const isOfficer = category === 'Attendance - Officer'

      // Find the right column by searching for 'general' or 'officer' in headers
      const headers = (await sheetsGet(token, `'${tab}'!1:1`))[0] ?? []
      const colIdx  = headers.findIndex(h =>
        isOfficer ? /officer/i.test(h) : /general/i.test(h)
      )
      if (colIdx < 0) throw new Error(
        `Could not find ${isOfficer ? 'Officer' : 'General'} meetings column in Attendance tab. Headers found: ${headers.join(', ')}`
      )

      // Find the member's row
      const nameRows = await sheetsGet(token, `'${tab}'!A:B`)
      let rowIdx = -1
      for (let i = 1; i < nameRows.length; i++) {
        const rLast  = (nameRows[i][0] ?? '').trim().toLowerCase()
        const rFirst = (nameRows[i][1] ?? '').trim().toLowerCase()
        if (rLast === lastName.toLowerCase() && rFirst === firstName.toLowerCase()) {
          rowIdx = i; break
        }
      }
      if (rowIdx < 0) throw new Error(`Member "${firstName} ${lastName}" not found in Attendance tab`)

      const col        = colLetter(colIdx + 1)
      const cellRef    = `'${tab}'!${col}${rowIdx + 1}`
      const current    = await sheetsGet(token, cellRef)
      const currentVal = Number(current[0]?.[0] ?? 0)
      await sheetsSet(token, cellRef, currentVal + 1)
      return json({ ok: true, cell: cellRef, value: currentVal + 1 })
    }

    // ── Conference / BAA: just write 1 (attended) ───────────────
    if (category === 'Conference' || category === 'BAA') {
      const headers = (await sheetsGet(token, `'${tab}'!1:1`))[0] ?? []
      const colIdx  = headers.findIndex(h => h.trim().toLowerCase() === event_name.trim().toLowerCase())
      if (colIdx < 0) throw new Error(`Column "${event_name}" not found in ${tab} tab`)

      const nameRows = await sheetsGet(token, `'${tab}'!A:B`)
      let rowIdx = -1
      for (let i = 1; i < nameRows.length; i++) {
        const rLast  = (nameRows[i][0] ?? '').trim().toLowerCase()
        const rFirst = (nameRows[i][1] ?? '').trim().toLowerCase()
        if (rLast === lastName.toLowerCase() && rFirst === firstName.toLowerCase()) {
          rowIdx = i; break
        }
      }
      if (rowIdx < 0) throw new Error(`Member "${firstName} ${lastName}" not found in ${tab} tab`)

      const cellRef = `'${tab}'!${colLetter(colIdx + 1)}${rowIdx + 1}`
      await sheetsSet(token, cellRef, 1)
      return json({ ok: true, cell: cellRef, value: 1 })
    }

    // ── Service / Fundraising / Social: find event column, write points ─
    const headers = (await sheetsGet(token, `'${tab}'!1:1`))[0] ?? []
    const colIdx  = headers.findIndex(h => h.trim().toLowerCase() === event_name.trim().toLowerCase())
    if (colIdx < 0) throw new Error(`Column "${event_name}" not found in ${tab} tab`)

    // Find member row from A:B columns
    const nameRows = await sheetsGet(token, `'${tab}'!A:B`)
    let rowIdx = -1
    for (let i = 1; i < nameRows.length; i++) {
      const rLast  = (nameRows[i][0] ?? '').trim().toLowerCase()
      const rFirst = (nameRows[i][1] ?? '').trim().toLowerCase()
      if (rLast === lastName.toLowerCase() && rFirst === firstName.toLowerCase()) {
        rowIdx = i; break
      }
    }
    if (rowIdx < 0) throw new Error(`Member "${firstName} ${lastName}" not found in ${tab} tab`)

    // Write the points value directly
    const cellRef = `'${tab}'!${colLetter(colIdx + 1)}${rowIdx + 1}`
    await sheetsSet(token, cellRef, value)

    return json({ ok: true, cell: cellRef, value })
  } catch (err) {
    console.error(err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
