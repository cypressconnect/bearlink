/**
 * Bear Link — Google Apps Script
 * Bidirectional sync: Google Sheet ↔ Supabase
 *
 * ── Setup order ─────────────────────────────────────────────
 * 1. Generate a random secret string (any UUID or random hex).
 * 2. Add it to Supabase → Edge Functions → Secrets as SHEET_SYNC_SECRET.
 * 3. Deploy the sheet-sync Edge Function.
 * 4. Paste this file into Extensions → Apps Script → Save.
 * 5. Run setSheetSyncSecret() ONCE — paste your secret when prompted.
 *    (Stores it securely in Script Properties, never in this file.)
 * 6. Run importSheetToSupabase() ONCE to seed Supabase from the sheet.
 * 7. Run setupTrigger() ONCE to enable live onEdit sync.
 *
 * ── How ongoing edits sync ───────────────────────────────────
 * Services / Fundraising / Social
 *   Column header = event name. Cell = points awarded.
 *   Editing sets the points. Setting to 0/blank removes them.
 *
 * Conferences / BAA
 *   Column header = event/award name. Cell = 1 (attended) or 0.
 *   1 → 6 pts. 0 → removes the assignment.
 *
 * Attendance
 *   Col C = General Meetings count. Col D = Officer Meetings count.
 *   Each meeting = 2 pts. Editing updates points (count × 2).
 *
 * Top 50 Members / Points in General — read-only (written by DB).
 */

// ── CONFIG ─────────────────────────────────────────────────────
var SUPABASE_URL      = 'https://lrnlqdxudmoszlaeatst.supabase.co'
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmxxZHh1ZG1vc3psYWVhdHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTA4NzgsImV4cCI6MjA5MTc2Njg3OH0.B6uUexKBMGwn3brnrdsQQLF1Myrqd_4lyOV9GoffhYg'
var PROXY_URL         = SUPABASE_URL + '/functions/v1/sheet-sync'
// ───────────────────────────────────────────────────────────────

// Tab name → { category, binary }
var TAB_CONFIG = {
  'Services'    : { category: 'Service',     binary: false, pts: null, ptsMap: {} },
  'Fundraising' : { category: 'Fundraising', binary: false, pts: null, ptsMap: {} },
  'Social'      : { category: 'Social',      binary: false, pts: null, ptsMap: {} },
  'Conferences' : { category: 'Conference',  binary: true,  pts: 12,   ptsMap: {} },
  'BAA'         : { category: 'BAA',         binary: true,  pts: 6,    ptsMap: {
    'Everfi Alternative BAA' : 18,
    'Capstone Project'       : 20,
    // Contributor Award, Leader Award, Advocate Award default to 6 (pts above)
  }},
}

// ── Secret helpers ─────────────────────────────────────────────

/**
 * Run this ONCE to store your SHEET_SYNC_SECRET securely.
 * It will be saved in Script Properties (not visible in code).
 */
function setSheetSyncSecret() {
  var secret = Browser.inputBox(
    'Bear Link Setup',
    'Paste your SHEET_SYNC_SECRET (from Supabase → Edge Functions → Secrets):',
    Browser.Buttons.OK_CANCEL
  )
  if (secret && secret !== 'cancel') {
    PropertiesService.getScriptProperties().setProperty('SHEET_SYNC_SECRET', secret)
    Logger.log('Secret stored successfully.')
  } else {
    Logger.log('Cancelled — secret not saved.')
  }
}

function getSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_SECRET')
  if (!secret) throw new Error('SHEET_SYNC_SECRET not set. Run setSheetSyncSecret() first.')
  return secret
}

// ── Proxy call helper ──────────────────────────────────────────
function callProxy_(action, payload) {
  payload.action = action
  var resp = UrlFetchApp.fetch(PROXY_URL, {
    method            : 'post',
    contentType       : 'application/json',
    headers           : { 'x-sheet-secret': getSecret_() },
    payload           : JSON.stringify(payload),
    muteHttpExceptions: true,
  })
  var code = resp.getResponseCode()
  if (code < 200 || code >= 300) {
    Logger.log('Proxy error [' + action + '] HTTP ' + code + ': ' + resp.getContentText())
    return null
  }
  return JSON.parse(resp.getContentText())
}

// ════════════════════════════════════════════════════════════════
// INITIAL IMPORT: Sheet → Supabase (run once)
// ════════════════════════════════════════════════════════════════

/**
 * Reads all tabs and pushes everything into Supabase.
 * Run ONCE before going live. Safe to re-run — uses upsert.
 */
function importSheetToSupabase() {
  var ss = SpreadsheetApp.getActive()

  Logger.log('=== Bear Link: Sheet → Supabase import ===')

  Logger.log('Step 1/3: Importing members...')
  _importMembers(ss)

  Logger.log('Step 2/3: Fetching member IDs...')
  var memberMap = _buildMemberMap()
  Logger.log('  ' + Object.keys(memberMap).length + ' members in DB')

  Logger.log('Step 3/3: Importing points...')
  _importCategoryTab(ss, 'Services',    'Service',     false, null, null,                                               memberMap)
  _importCategoryTab(ss, 'Fundraising', 'Fundraising', false, null, null,                                               memberMap)
  _importCategoryTab(ss, 'Social',      'Social',      false, null, null,                                               memberMap)
  _importCategoryTab(ss, 'Conferences', 'Conference',  true,  12,   null,                                               memberMap)
  _importCategoryTab(ss, 'BAA',         'BAA',         true,  6,    { 'Everfi Alternative BAA': 18, 'Capstone Project': 20 },   memberMap)
  _importAttendance(ss, memberMap)
  _importMiscPoints(ss, memberMap)

  Logger.log('=== Import complete! Run setupTrigger() next. ===')
}

function _importMembers(ss) {
  var sheet = ss.getSheetByName('Points in General')
  if (!sheet) { Logger.log('  ERROR: "Points in General" tab not found'); return }

  var data = sheet.getDataRange().getValues()
  // Row 0 = header: [Last Name, First Name, Grade, ...]

  // Fetch existing members to avoid duplicates
  var existingBody = sbGet_(SUPABASE_URL + '/rest/v1/members?select=first_name,last_name&limit=1000')
  var existing     = existingBody ? JSON.parse(existingBody) : []
  var existingKeys = {}
  existing.forEach(function(m) {
    existingKeys[(m.first_name + '|' + m.last_name).toLowerCase()] = true
  })

  var newMembers = []
  for (var i = 1; i < data.length; i++) {
    var lastName  = String(data[i][0]).trim()
    var firstName = String(data[i][1]).trim()
    if (!lastName && !firstName) continue
    if (existingKeys[(firstName + '|' + lastName).toLowerCase()]) continue
    var grade = parseInt(data[i][2]) || null
    newMembers.push({ name: firstName + ' ' + lastName, first_name: firstName, last_name: lastName, grade: grade })
  }

  if (newMembers.length === 0) { Logger.log('  All members already in DB'); return }

  // Send in batches of 100 via proxy
  for (var i = 0; i < newMembers.length; i += 100) {
    var result = callProxy_('create_members', { members: newMembers.slice(i, i + 100) })
    Logger.log('  Batch ' + (Math.floor(i / 100) + 1) + ': ' + (result ? 'OK' : 'FAILED'))
  }
  Logger.log('  ' + newMembers.length + ' new members created')
}

function _buildMemberMap() {
  var body = sbGet_(SUPABASE_URL + '/rest/v1/members?select=id,first_name,last_name&limit=1000')
  if (!body) return {}
  var map = {}
  JSON.parse(body).forEach(function(m) {
    map[(m.first_name + '|' + m.last_name).toLowerCase()] = m.id
  })
  return map
}

function _importCategoryTab(ss, tabName, category, binary, binaryPts, binaryPtsMap, memberMap) {
  var sheet = ss.getSheetByName(tabName)
  if (!sheet) { Logger.log('  Skipping "' + tabName + '" — tab not found'); return }

  var data = sheet.getDataRange().getValues()
  if (data.length < 2) { Logger.log('  Skipping "' + tabName + '" — no data'); return }

  var headers = data[0] // [Last Name, First Name, EventA, EventB, ...]

  // Collect unique event names (cols 2+), skip any total/summary columns
  var eventDefs = []
  for (var c = 2; c < headers.length; c++) {
    var name = String(headers[c]).trim()
    if (!name) continue
    if (/^(total|sum|#|points\s+for)/i.test(name)) continue // skip summary columns
    var evPts = binary ? ((binaryPtsMap && binaryPtsMap[name]) ? binaryPtsMap[name] : binaryPts) : 0
    eventDefs.push({ col: c, name: name, category: category, point_value: evPts })
  }
  if (eventDefs.length === 0) { Logger.log('  No events in ' + tabName); return }

  // Bulk get-or-create events via proxy, get back name|category → id map
  var result = callProxy_('bulk_get_or_create_events', { events: eventDefs })
  if (!result) { Logger.log('  Failed to get/create events for ' + tabName); return }
  var eventIdMap = result.map // key: "name|category" (lowercase)

  // Build assignments array
  var assignments = []
  for (var row = 1; row < data.length; row++) {
    var lastName  = String(data[row][0]).trim()
    var firstName = String(data[row][1]).trim()
    if (!lastName && !firstName) continue

    var memberId = memberMap[(firstName + '|' + lastName).toLowerCase()]
    if (!memberId) { Logger.log('  Unknown member (skipping): ' + firstName + ' ' + lastName); continue }

    for (var ei = 0; ei < eventDefs.length; ei++) {
      var def     = eventDefs[ei]
      var eventId = eventIdMap[(def.name.toLowerCase() + '|' + category)]
      if (!eventId) continue

      var num = Number(data[row][def.col]) || 0
      var pts
      if (binary) {
        if (num !== 1) continue
        pts = (binaryPtsMap && binaryPtsMap[def.name]) ? binaryPtsMap[def.name] : binaryPts
      } else {
        if (num <= 0) continue
        pts = num
      }
      assignments.push({ member_id: memberId, event_id: eventId, points_awarded: pts })
    }
  }

  if (assignments.length === 0) { Logger.log('  ' + tabName + ': nothing to import'); return }

  // Bulk upsert via proxy in batches of 200
  for (var i = 0; i < assignments.length; i += 200) {
    var res = callProxy_('bulk_upsert_assignments', { assignments: assignments.slice(i, i + 200) })
    Logger.log('  ' + tabName + ' batch ' + (Math.floor(i / 200) + 1) + ': ' + (res ? 'OK' : 'FAILED'))
  }
  Logger.log('  ' + tabName + ': ' + assignments.length + ' assignments imported')
}

// ── Import miscellaneous point columns from Points in General ──
// Reads all columns after Grade that aren't known category subtotals,
// importing them as 'Other' category events.
function _importMiscPoints(ss, memberMap) {
  var sheet = ss.getSheetByName('Points in General')
  if (!sheet) { Logger.log('  Skipping misc — Points in General not found'); return }

  var data = sheet.getDataRange().getValues()
  if (data.length < 2) return

  var headers = data[0]

  // Misc columns: K through W (0-indexed: 10 through 22)
  // Starts at T-Shirt Contest, ends at Committee Meetings
  var MISC_START = 10  // column K
  var MISC_END   = 22  // column W

  var eventDefs = []
  for (var c = MISC_START; c <= MISC_END; c++) {
    var name = String(headers[c]).trim()
    if (!name) continue
    eventDefs.push({ col: c, name: name, category: 'Other', point_value: 0 })
  }

  if (eventDefs.length === 0) { Logger.log('  No misc events found in Points in General'); return }
  Logger.log('  Misc events found: ' + eventDefs.map(function(e) { return e.name }).join(', '))

  var result = callProxy_('bulk_get_or_create_events', { events: eventDefs })
  if (!result) { Logger.log('  Failed to get/create misc events'); return }
  var eventIdMap = result.map

  var assignments = []
  for (var row = 1; row < data.length; row++) {
    var lastName  = String(data[row][0]).trim()
    var firstName = String(data[row][1]).trim()
    if (!lastName && !firstName) continue

    var memberId = memberMap[(firstName + '|' + lastName).toLowerCase()]
    if (!memberId) continue

    for (var ei = 0; ei < eventDefs.length; ei++) {
      var def = eventDefs[ei]
      var eventId = eventIdMap[(def.name.toLowerCase() + '|Other')]
      if (!eventId) continue
      var pts = Number(data[row][def.col]) || 0
      if (pts <= 0) continue
      assignments.push({ member_id: memberId, event_id: eventId, points_awarded: pts })
    }
  }

  if (assignments.length === 0) { Logger.log('  Misc: nothing to import'); return }

  for (var i = 0; i < assignments.length; i += 200) {
    var res = callProxy_('bulk_upsert_assignments', { assignments: assignments.slice(i, i + 200) })
    Logger.log('  Misc batch ' + (Math.floor(i / 200) + 1) + ': ' + (res ? 'OK' : 'FAILED'))
  }
  Logger.log('  Misc: ' + assignments.length + ' assignments imported')
}

function _importAttendance(ss, memberMap) {
  var sheet = ss.getSheetByName('Attendance')
  if (!sheet) { Logger.log('  Skipping Attendance — tab not found'); return }

  var data = sheet.getDataRange().getValues()
  if (data.length < 2) return
  // Cols: [0]=Last Name, [1]=First Name, [2]=General count, [3]=Officer count

  var genResult = callProxy_('get_or_create_event', { name: 'General Meeting', category: 'Attendance', point_value: 2 })
  var offResult = callProxy_('get_or_create_event', { name: 'Officer Meeting', category: 'Attendance', point_value: 2 })
  var genId = genResult && genResult.data ? genResult.data.id : null
  var offId = offResult && offResult.data ? offResult.data.id : null

  var assignments = []
  for (var row = 1; row < data.length; row++) {
    var lastName  = String(data[row][0]).trim()
    var firstName = String(data[row][1]).trim()
    if (!lastName && !firstName) continue

    var memberId = memberMap[(firstName + '|' + lastName).toLowerCase()]
    if (!memberId) continue

    var genCount = Number(data[row][2]) || 0
    var offCount = Number(data[row][3]) || 0
    if (genId && genCount > 0) assignments.push({ member_id: memberId, event_id: genId, points_awarded: genCount * 2 })
    if (offId && offCount > 0) assignments.push({ member_id: memberId, event_id: offId, points_awarded: offCount * 2 })
  }

  if (assignments.length === 0) return
  var res = callProxy_('bulk_upsert_assignments', { assignments: assignments })
  Logger.log('  Attendance: ' + assignments.length + ' assignments — ' + (res ? 'OK' : 'FAILED'))
}

// ════════════════════════════════════════════════════════════════
// ONGOING SYNC: onEdit trigger → Supabase
// ════════════════════════════════════════════════════════════════

function onEditTrigger(e) {
  var sheet     = e.range.getSheet()
  var sheetName = sheet.getName()
  var row       = e.range.getRow()
  var col       = e.range.getColumn()
  var value     = e.range.getValue()

  if (row <= 1) return

  var config = TAB_CONFIG[sheetName]
  if (config) { handleCategoryEdit_(sheet, row, col, value, config); return }
  if (sheetName === 'Attendance') handleAttendanceEdit_(sheet, row, col, value)
}

function handleCategoryEdit_(sheet, row, col, value, config) {
  if (col <= 2) return

  var lastName  = String(sheet.getRange(row, 1).getValue()).trim()
  var firstName = String(sheet.getRange(row, 2).getValue()).trim()
  if (!lastName && !firstName) return

  var eventName = String(sheet.getRange(1, col).getValue()).trim()
  if (!eventName) return
  if (/^(total|sum|#|points\s+for)/i.test(eventName)) return // ignore summary columns

  var member = getMemberByName_(firstName, lastName)
  if (!member) { Logger.log('Member not found: ' + firstName + ' ' + lastName); return }

  var binaryPts = config.binary
    ? ((config.ptsMap && config.ptsMap[eventName]) ? config.ptsMap[eventName] : config.pts)
    : 0

  var eventResult = callProxy_('get_or_create_event', {
    name       : eventName,
    category   : config.category,
    point_value: binaryPts,
  })
  if (!eventResult || !eventResult.data) { Logger.log('Could not get/create event: ' + eventName); return }
  var eventId = eventResult.data.id

  var num = Number(value) || 0
  if (config.binary) {
    num === 1
      ? callProxy_('upsert_assignment', { member_id: member.id, event_id: eventId, points_awarded: binaryPts })
      : callProxy_('delete_assignment', { member_id: member.id, event_id: eventId })
  } else {
    num > 0
      ? callProxy_('upsert_assignment', { member_id: member.id, event_id: eventId, points_awarded: num })
      : callProxy_('delete_assignment', { member_id: member.id, event_id: eventId })
  }
}

function handleAttendanceEdit_(sheet, row, col, value) {
  if (col !== 3 && col !== 4) return

  var lastName  = String(sheet.getRange(row, 1).getValue()).trim()
  var firstName = String(sheet.getRange(row, 2).getValue()).trim()
  if (!lastName && !firstName) return

  var member = getMemberByName_(firstName, lastName)
  if (!member) { Logger.log('Member not found: ' + firstName + ' ' + lastName); return }

  var count     = Number(value) || 0
  var points    = count * 2
  var eventName = col === 3 ? 'General Meeting' : 'Officer Meeting'

  var eventResult = callProxy_('get_or_create_event', { name: eventName, category: 'Attendance', point_value: 2 })
  if (!eventResult || !eventResult.data) return
  var eventId = eventResult.data.id

  points > 0
    ? callProxy_('upsert_assignment', { member_id: member.id, event_id: eventId, points_awarded: points })
    : callProxy_('delete_assignment', { member_id: member.id, event_id: eventId })
}

// ════════════════════════════════════════════════════════════════
// SUPABASE READ HELPERS (anon key — reads only)
// ════════════════════════════════════════════════════════════════

function sbGet_(url) {
  var resp = UrlFetchApp.fetch(url, {
    method            : 'get',
    headers           : { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    muteHttpExceptions: true,
  })
  return resp.getResponseCode() === 200 ? resp.getContentText() : null
}

function getMemberByName_(firstName, lastName) {
  var url  = SUPABASE_URL + '/rest/v1/members?first_name=eq.' + encodeURIComponent(firstName) +
             '&last_name=eq.' + encodeURIComponent(lastName) + '&limit=1'
  var body = sbGet_(url)
  if (!body) return null
  var rows = JSON.parse(body)
  return rows.length > 0 ? rows[0] : null
}

// ════════════════════════════════════════════════════════════════
// ONE-TIME SETUP FUNCTIONS
// ════════════════════════════════════════════════════════════════

/** Install the onEdit trigger. Run once after importSheetToSupabase(). */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onEditTrigger') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create()
  Logger.log('onEdit trigger installed.')
}

/**
 * Manually trigger a full DB → Sheet sync.
 * Use if the sheet ever gets out of sync with the DB.
 */
function syncDbToSheet() {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/functions/v1/sync-to-sheets', {
    method            : 'post',
    contentType       : 'application/json',
    payload           : '{}',
    muteHttpExceptions: true,
  })
  Logger.log(resp.getResponseCode() < 300
    ? 'Sync complete: ' + resp.getContentText()
    : 'Sync failed: '  + resp.getContentText())
}
