/**
 * Bear Link — Google Apps Script
 * Two-way sync between the FBLA points spreadsheet and the website.
 *
 * ── First-time setup ─────────────────────────────────────────────────
 * 1. Extensions -> Apps Script, paste this file, Save.
 * 2. Reload the spreadsheet. A "Bear Link" menu appears.
 * 3. Bear Link -> Setup -> Set sync secret       (paste SHEET_SYNC_SECRET)
 * 4. Bear Link -> Setup -> Check connection
 * 5. Bear Link -> Repair sheet headers           (fixes corrupted A1 cells)
 * 6. Bear Link -> Import sheet into website      (seeds the database)
 * 7. Bear Link -> Setup -> Install live sync     (enables the onEdit trigger)
 *
 * ── How each tab syncs ───────────────────────────────────────────────
 *  Services / Fundraising / Social / Committee Meetings
 *      Header row = event names. Cell = points for that member.
 *      Clearing a cell removes the points.
 *  Conferences / BAA
 *      Cell = 1 (earned) or 0/blank (not earned). Points come from the
 *      table below: conferences 12, Everfi 18, Capstone 20, other BAAs 6.
 *  Attendance
 *      "# General Meetings Attended" and "# Officer Meetings Attended"
 *      hold COUNTS. Each meeting is worth 2 points.
 *  Points in General
 *      The one-off point columns (T-Shirt Contest, Area Placements, ...)
 *      sync as Miscellaneous events. Formula and subtotal columns are
 *      ignored -- that is what put "Attendance Formula" and "|" into the
 *      website's event list last time.
 *  Top Member List / SETTINGS
 *      Never touched.
 */

// ── CONFIG ────────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://lrnlqdxudmoszlaeatst.supabase.co'
var PROXY_URL    = SUPABASE_URL + '/functions/v1/sheet-sync'

var POINTS_PER_MEETING = 2

// category -> tab names to look for, in order of preference
var TAB_ALIASES = {
  Service      : ['Services', 'Service', 'Service Projects'],
  Fundraising  : ['Fundraising', 'Fundraisers', 'Fundraiser'],
  Social       : ['Social', 'Socials', 'Social Events'],
  Conference   : ['Conferences', 'Conference'],
  BAA          : ['BAA', 'BAAs', 'Business Achievement Awards'],
  Attendance   : ['Attendance'],
  Committee    : ['Committee Meetings', 'Committee', 'Committees'],
  Miscellaneous: ['Points in General', 'General Points', 'Points'],
}

// Tabs where a cell is 1/0 rather than a point value.
var BINARY_CATEGORIES = { Conference: 12, BAA: 6 }

// Per-award overrides for binary tabs.
var POINT_OVERRIDES = {
  'Everfi Alternative BAA': 18,
  'Capstone Project'      : 20,
}

// Headers that are computed columns, not events.
var SUBTOTAL_RE = /^(total|sum|#|points\s+for)|formula$|\((x)?\d+x?\)$/i

// Cross-tab rollups on "Points in General". They mirror totals from other
// tabs, so importing them would double-count every point.
var MISC_ROLLUP_HEADERS = [
  'grade lvl', 'socials', 'service project - points', 'fundraising points',
  'attendance', 'conference', 'total points',
]

// Tabs that must never be written to or imported from.
var IGNORED_TABS = /^(top\s*\d*\s*member|settings)/i

// ══════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Bear Link')
    .addItem('Import sheet into website', 'importSheetToSupabase')
    .addItem('Push one tab to website',   'pushActiveTab')
    .addSeparator()
    .addItem('Repair sheet headers',      'repairSheetHeaders')
    .addItem('Health check',              'healthCheck')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Setup')
      .addItem('Set sync secret',   'setSheetSyncSecret')
      .addItem('Check connection',  'checkConnection')
      .addItem('Install live sync', 'setupTrigger')
      .addItem('Remove live sync',  'removeTrigger'))
    .addToUi()
}

function toast_(msg, title) {
  SpreadsheetApp.getActive().toast(msg, title || 'Bear Link', 8)
}

function alert_(title, msg) {
  SpreadsheetApp.getUi().alert(title, msg, SpreadsheetApp.getUi().ButtonSet.OK)
}

// ══════════════════════════════════════════════════════════════════════
// SECRET + TRANSPORT
// ══════════════════════════════════════════════════════════════════════

function setSheetSyncSecret() {
  var ui = SpreadsheetApp.getUi()
  var resp = ui.prompt(
    'Bear Link setup',
    'Paste your SHEET_SYNC_SECRET (Supabase -> Edge Functions -> Secrets):',
    ui.ButtonSet.OK_CANCEL
  )
  if (resp.getSelectedButton() !== ui.Button.OK) return
  var secret = resp.getResponseText().trim()
  if (!secret) { alert_('Bear Link', 'Nothing pasted — secret not saved.'); return }
  PropertiesService.getScriptProperties().setProperty('SHEET_SYNC_SECRET', secret)
  alert_('Bear Link', 'Secret saved. Now run Setup -> Check connection.')
}

function getSecret_() {
  var s = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_SECRET')
  if (!s) throw new Error('Sync secret not set. Run Bear Link -> Setup -> Set sync secret.')
  return s
}

function callProxy_(action, payload) {
  payload = payload || {}
  payload.action = action
  var resp = UrlFetchApp.fetch(PROXY_URL, {
    method            : 'post',
    contentType       : 'application/json',
    headers           : { 'x-sheet-secret': getSecret_() },
    payload           : JSON.stringify(payload),
    muteHttpExceptions: true,
  })
  var code = resp.getResponseCode()
  var text = resp.getContentText()
  if (code < 200 || code >= 300) {
    Logger.log('Proxy error [' + action + '] HTTP ' + code + ': ' + text)
    throw new Error(action + ' failed (HTTP ' + code + '): ' + text)
  }
  return JSON.parse(text)
}

/**
 * The member index, cached for 10 minutes. The live-sync trigger used to
 * refetch all 200 members on every single cell edit.
 */
function memberMap_(forceRefresh) {
  var cache = CacheService.getScriptCache()
  if (!forceRefresh) {
    var hit = cache.get('memberMap')
    if (hit) return JSON.parse(hit)
  }
  var map = callProxy_('resolve_members', {}).map
  try {
    cache.put('memberMap', JSON.stringify(map), 600)
  } catch (e) {
    // >100KB: too big to cache, just use it directly this time.
    Logger.log('member map too large to cache: ' + e)
  }
  return map
}

function checkConnection() {
  try {
    callProxy_('ping', {})
    var m = callProxy_('resolve_members', {})
    alert_('Bear Link', 'Connected.\n\n' + m.count + ' members currently in the website database.')
  } catch (e) {
    alert_('Bear Link — connection failed', String(e))
  }
}

// ══════════════════════════════════════════════════════════════════════
// SHEET STRUCTURE HELPERS
// ══════════════════════════════════════════════════════════════════════

function norm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Find the real Sheet object for a category, or null. */
function findTab_(category) {
  var ss = SpreadsheetApp.getActive()
  var aliases = TAB_ALIASES[category] || [category]
  var sheets = ss.getSheets().filter(function (sh) { return !IGNORED_TABS.test(sh.getName()) })
  var i, j
  for (i = 0; i < aliases.length; i++) {
    for (j = 0; j < sheets.length; j++) {
      if (sheets[j].getName() === aliases[i]) return sheets[j]
    }
  }
  for (i = 0; i < aliases.length; i++) {
    for (j = 0; j < sheets.length; j++) {
      if (norm_(sheets[j].getName()) === norm_(aliases[i])) return sheets[j]
    }
  }
  for (i = 0; i < aliases.length; i++) {
    for (j = 0; j < sheets.length; j++) {
      if (norm_(sheets[j].getName()).indexOf(norm_(aliases[i])) >= 0) return sheets[j]
    }
  }
  return null
}

/** Which category does this sheet belong to? null if it is not synced. */
function categoryForSheet_(sheet) {
  var name = sheet.getName()
  if (IGNORED_TABS.test(name)) return null
  for (var cat in TAB_ALIASES) {
    var found = findTab_(cat)
    if (found && found.getSheetId() === sheet.getSheetId()) return cat
  }
  return null
}

/**
 * Read a tab once: display values plus the formulas, so we can tell a
 * typed number from a computed one.
 */
function readTab_(sheet) {
  var range = sheet.getDataRange()
  return {
    values  : range.getValues(),
    formulas: range.getFormulas(),
  }
}

function isFormulaCell_(grid, row, col) {
  var f = grid.formulas[row] && grid.formulas[row][col]
  return !!(f && String(f).charAt(0) === '=')
}

/**
 * Which columns on this tab are real events?
 * Skips the roster columns, blanks, subtotals, and any column whose data
 * cells are formulas.
 */
function eventColumns_(grid, category) {
  var headers = grid.values[0] || []
  var out = []

  // Everything to the RIGHT of a tab's subtotal column is invisible to the
  // sheet's own totals, so importing it would make the site disagree with
  // the sheet. Stop at the subtotal instead.
  //
  // "Points in General" is exempt: its rollups (Attendance (x2), Socials,
  // ...) sit at the LEFT, before the real one-off point columns, so
  // truncating there would drop everything. That tab uses the skip rules
  // below instead.
  var limit = headers.length
  if (category !== 'Miscellaneous') {
    for (var t = 2; t < headers.length; t++) {
      var h = String(headers[t] == null ? '' : headers[t]).trim()
      if (h && SUBTOTAL_RE.test(h)) { limit = t; break }
    }
  }

  for (var c = 2; c < limit; c++) {
    var name = String(headers[c] == null ? '' : headers[c]).trim()
    if (!name) continue
    if (name === '\\' || name === '|') continue
    if (SUBTOTAL_RE.test(name)) continue
    if (category === 'Miscellaneous' &&
        MISC_ROLLUP_HEADERS.indexOf(name.toLowerCase()) >= 0) continue

    // On "Points in General" a computed column is a cross-tab rollup
    // (Committee Meetings = Committees!G, Socials = Social!G, ...), so it
    // must not become an event. On the other tabs a computed column is a
    // legitimate score -- "Area Conference (November 2025)" is a formula
    // for all 200 members -- so its VALUE is imported like any other.
    if (category === 'Miscellaneous') {
      var formulaRows = 0, checked = 0
      for (var r = 1; r < Math.min(grid.values.length, 6); r++) {
        checked++
        if (isFormulaCell_(grid, r, c)) formulaRows++
      }
      if (checked > 0 && formulaRows === checked) continue
    }

    out.push({ col: c, name: name })
  }
  return out
}

function pointsForBinary_(eventName, category) {
  if (POINT_OVERRIDES[eventName] != null) return POINT_OVERRIDES[eventName]
  return BINARY_CATEGORIES[category] || 0
}

function rosterFromTab_(grid) {
  var rows = []
  for (var r = 1; r < grid.values.length; r++) {
    var last  = String(grid.values[r][0] == null ? '' : grid.values[r][0]).trim()
    var first = String(grid.values[r][1] == null ? '' : grid.values[r][1]).trim()
    if (!last && !first) continue
    rows.push({ row: r, first: first, last: last, key: (first + '|' + last).toLowerCase() })
  }
  return rows
}

// ══════════════════════════════════════════════════════════════════════
// REPAIR: fix corrupted header cells
// ══════════════════════════════════════════════════════════════════════

/**
 * A1 on several tabs got overwritten (the Services tab literally held
 * "supabase functions deploy sync-to-sheets --no-verify-jwt", and the
 * Attendance tab held "Atte"). Anything that is not a Last Name header
 * in A1/B1 of a synced tab is restored.
 */
function repairSheetHeaders() {
  var fixed = []
  for (var cat in TAB_ALIASES) {
    var sheet = findTab_(cat)
    if (!sheet) continue

    var a1 = String(sheet.getRange(1, 1).getValue()).trim()
    var b1 = String(sheet.getRange(1, 2).getValue()).trim()

    if (norm_(a1) !== 'lastname') {
      sheet.getRange(1, 1).setValue('Last Name')
      fixed.push(sheet.getName() + '!A1  was: "' + a1 + '"')
    }
    if (norm_(b1) !== 'firstname') {
      sheet.getRange(1, 2).setValue('First Name')
      fixed.push(sheet.getName() + '!B1  was: "' + b1 + '"')
    }
  }
  SpreadsheetApp.flush()
  alert_('Bear Link — header repair',
    fixed.length ? 'Fixed ' + fixed.length + ' header cell(s):\n\n' + fixed.join('\n')
                 : 'All header cells already correct.')
}

// ══════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════

function healthCheck() {
  var lines = []
  for (var cat in TAB_ALIASES) {
    var sheet = findTab_(cat)
    if (!sheet) { lines.push('MISSING  ' + cat + '  (looked for: ' + TAB_ALIASES[cat].join(', ') + ')'); continue }
    var grid    = readTab_(sheet)
    var roster  = rosterFromTab_(grid)
    var events  = eventColumns_(grid, cat)
    lines.push('OK  ' + cat + ' -> "' + sheet.getName() + '"  ' +
               roster.length + ' members, ' + events.length + ' event column(s)')
  }

  var dbLine = ''
  try {
    var m = callProxy_('resolve_members', {})
    dbLine = '\n\nWebsite database: ' + m.count + ' members.'
  } catch (e) {
    dbLine = '\n\nWebsite database: NOT REACHABLE\n' + e
  }

  alert_('Bear Link — health check', lines.join('\n') + dbLine)
}

// ══════════════════════════════════════════════════════════════════════
// FULL IMPORT: Sheet -> website
// ══════════════════════════════════════════════════════════════════════

function importSheetToSupabase() {
  var ui = SpreadsheetApp.getUi()
  var go = ui.alert('Bear Link',
    'Import every tab into the website database?\n\n' +
    'This makes the website match this spreadsheet exactly. ' +
    'Points that are not in the sheet will be removed from the website.',
    ui.ButtonSet.OK_CANCEL)
  if (go !== ui.Button.OK) return

  var log = []
  try {
    toast_('Step 1/3 — members...')
    log.push(importMembers_())

    toast_('Step 2/3 — building member index...')
    var memberMap = memberMap_(true)
    log.push(Object.keys(memberMap).length + ' members matched')

    toast_('Step 3/3 — points...')
    for (var cat in TAB_ALIASES) {
      if (cat === 'Attendance') { log.push(importAttendance_(memberMap)); continue }
      log.push(importCategory_(cat, memberMap))
    }

    callProxy_('recalc_totals', {})
    alert_('Bear Link — import complete', log.join('\n'))
  } catch (e) {
    alert_('Bear Link — import failed', log.join('\n') + '\n\nERROR: ' + e)
  }
}

function importMembers_() {
  // The roster lives on "Points in General"; fall back to any synced tab.
  var sheet = findTab_('Miscellaneous') || findTab_('Social')
  if (!sheet) return 'Members: no roster tab found'

  var grid    = readTab_(sheet)
  var headers = grid.values[0] || []
  var gradeCol = -1
  for (var c = 0; c < headers.length; c++) {
    if (/grade/i.test(String(headers[c]))) { gradeCol = c; break }
  }

  var roster = rosterFromTab_(grid)
  var members = roster.map(function (p) {
    return {
      first_name: p.first,
      last_name : p.last,
      grade     : gradeCol >= 0 ? (parseInt(grid.values[p.row][gradeCol], 10) || null) : null,
    }
  })

  var created = 0
  for (var i = 0; i < members.length; i += 100) {
    var res = callProxy_('create_members', { members: members.slice(i, i + 100) })
    created += res.created || 0
  }
  return 'Members: ' + roster.length + ' in sheet, ' + created + ' new'
}

function importCategory_(category, memberMap) {
  var sheet = findTab_(category)
  if (!sheet) return category + ': tab not found — skipped'

  var grid   = readTab_(sheet)
  var roster = rosterFromTab_(grid)
  var cols   = eventColumns_(grid, category)
  if (!cols.length) return category + ': no event columns'

  var binary = !!BINARY_CATEGORIES[category]

  // Register every column as an event.
  var defs = cols.map(function (c) {
    return {
      name        : c.name,
      category    : category,
      point_value : binary ? pointsForBinary_(c.name, category) : 0,
      sheet_tab   : sheet.getName(),
      sheet_header: c.name,
    }
  })
  var eventMap = callProxy_('bulk_get_or_create_events', { events: defs }).map

  // Push each column as a complete snapshot, so cleared cells actually
  // remove points from the website.
  var unknown = 0, total = 0
  for (var i = 0; i < cols.length; i++) {
    var def     = cols[i]
    var eventId = eventMap[(def.name.trim().toLowerCase() + '|' + category.toLowerCase())]
    if (!eventId) continue

    var assignments = []
    for (var j = 0; j < roster.length; j++) {
      var p = roster[j]
      var memberId = memberMap[p.key]
      if (!memberId) { unknown++; continue }
      // Only skip computed cells on the rollup-heavy "Points in General"
      // tab; elsewhere a formula still produces a real score.
      if (category === 'Miscellaneous' && isFormulaCell_(grid, p.row, def.col)) continue

      var raw = Number(grid.values[p.row][def.col]) || 0
      var pts = binary ? (raw === 1 ? pointsForBinary_(def.name, category) : 0) : raw
      if (pts > 0) assignments.push({ member_id: memberId, points_awarded: pts })
    }

    callProxy_('replace_event_assignments', { event_id: eventId, assignments: assignments })
    total += assignments.length
  }

  return category + ' ("' + sheet.getName() + '"): ' + cols.length + ' columns, ' +
         total + ' point rows' + (unknown ? ', ' + unknown + ' unmatched member cells' : '')
}

function importAttendance_(memberMap) {
  var sheet = findTab_('Attendance')
  if (!sheet) return 'Attendance: tab not found — skipped'

  var grid    = readTab_(sheet)
  var headers = grid.values[0] || []
  var roster  = rosterFromTab_(grid)

  var genCol = -1, offCol = -1
  for (var c = 2; c < headers.length; c++) {
    var h = String(headers[c])
    if (genCol < 0 && /general/i.test(h)) genCol = c
    if (offCol < 0 && /officer/i.test(h)) offCol = c
  }
  if (genCol < 0 && offCol < 0) {
    return 'Attendance: no General/Officer columns found (headers: ' + headers.join(' | ') + ')'
  }

  var events = callProxy_('bulk_get_or_create_events', {
    events: [
      { name: 'General Meeting', category: 'Attendance', point_value: POINTS_PER_MEETING,
        sheet_tab: sheet.getName(), sheet_header: genCol >= 0 ? String(headers[genCol]) : 'General' },
      { name: 'Officer Meeting', category: 'Attendance', point_value: POINTS_PER_MEETING,
        sheet_tab: sheet.getName(), sheet_header: offCol >= 0 ? String(headers[offCol]) : 'Officer' },
    ],
  }).map

  var pairs = [
    { id: events['general meeting|attendance'], col: genCol },
    { id: events['officer meeting|attendance'], col: offCol },
  ]

  var total = 0
  for (var k = 0; k < pairs.length; k++) {
    if (!pairs[k].id || pairs[k].col < 0) continue
    var assignments = []
    for (var j = 0; j < roster.length; j++) {
      var p = roster[j]
      var memberId = memberMap[p.key]
      if (!memberId) continue
      var count = Number(grid.values[p.row][pairs[k].col]) || 0
      if (count > 0) assignments.push({ member_id: memberId, points_awarded: count * POINTS_PER_MEETING })
    }
    callProxy_('replace_event_assignments', { event_id: pairs[k].id, assignments: assignments })
    total += assignments.length
  }

  return 'Attendance ("' + sheet.getName() + '"): ' + total + ' point rows'
}

/** Re-push just the tab the user is looking at. */
function pushActiveTab() {
  var sheet = SpreadsheetApp.getActiveSheet()
  var cat   = categoryForSheet_(sheet)
  if (!cat) { alert_('Bear Link', '"' + sheet.getName() + '" is not a synced tab.'); return }

  try {
    var memberMap = memberMap_(true)
    var msg = cat === 'Attendance' ? importAttendance_(memberMap) : importCategory_(cat, memberMap)
    callProxy_('recalc_totals', {})
    alert_('Bear Link', msg)
  } catch (e) {
    alert_('Bear Link — push failed', String(e))
  }
}

// ══════════════════════════════════════════════════════════════════════
// LIVE SYNC: onEdit -> website
// ══════════════════════════════════════════════════════════════════════

function onEditTrigger(e) {
  try {
    if (!e || !e.range) return
    var sheet = e.range.getSheet()
    var cat   = categoryForSheet_(sheet)
    if (!cat) return

    var row = e.range.getRow()
    var col = e.range.getColumn()
    if (row < 2 || col < 3) return                 // header row / roster columns

    // A multi-cell paste: re-push the whole tab instead of one cell.
    if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) {
      var pasted = memberMap_(false)
      if (cat === 'Attendance') importAttendance_(pasted)
      else                      importCategory_(cat, pasted)
      toast_('Synced the whole "' + sheet.getName() + '" tab to the website.')
      return
    }

    var lastName  = String(sheet.getRange(row, 1).getValue()).trim()
    var firstName = String(sheet.getRange(row, 2).getValue()).trim()
    if (!lastName && !firstName) return

    var header = String(sheet.getRange(1, col).getValue()).trim()
    if (!header || SUBTOTAL_RE.test(header)) return
    if (cat === 'Miscellaneous' && e.range.getFormula()) return

    // Same rule as the bulk import: ignore columns past the subtotal.
    if (cat !== 'Miscellaneous') {
      var hdrRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      for (var t = 2; t < hdrRow.length; t++) {
        var ht = String(hdrRow[t] == null ? '' : hdrRow[t]).trim()
        if (ht && SUBTOTAL_RE.test(ht)) {
          if (col - 1 > t) {
            toast_('"' + header + '" is past the "' + ht + '" column, so the sheet does not count it. Ignored.')
            return
          }
          break
        }
      }
    }

    var lookup = (firstName + '|' + lastName).toLowerCase()
    var member = memberMap_(false)[lookup]
    if (!member) member = memberMap_(true)[lookup]   // maybe just added — refetch once
    if (!member) { toast_('"' + firstName + ' ' + lastName + '" is not in the website yet.'); return }

    var value = Number(e.range.getValue()) || 0

    if (cat === 'Attendance') {
      var officer  = /officer/i.test(header)
      var general  = /general/i.test(header)
      if (!officer && !general) return
      var evName   = officer ? 'Officer Meeting' : 'General Meeting'
      var ev       = callProxy_('get_or_create_event', {
        name: evName, category: 'Attendance', point_value: POINTS_PER_MEETING,
        sheet_tab: sheet.getName(), sheet_header: header,
      }).data
      callProxy_('upsert_assignment', {
        member_id: member, event_id: ev.id, points_awarded: value * POINTS_PER_MEETING,
      })
      toast_(firstName + ' ' + lastName + ': ' + evName + ' x' + value +
             ' = ' + (value * POINTS_PER_MEETING) + ' pts')
      return
    }

    var binary = !!BINARY_CATEGORIES[cat]
    var pv     = binary ? pointsForBinary_(header, cat) : 0
    var event  = callProxy_('get_or_create_event', {
      name: header, category: cat, point_value: pv,
      sheet_tab: sheet.getName(), sheet_header: header,
    }).data

    var points = binary ? (value === 1 ? pv : 0) : value
    callProxy_('upsert_assignment', {
      member_id: member, event_id: event.id, points_awarded: points,
    })
    toast_(firstName + ' ' + lastName + ': ' + header + ' = ' + points + ' pts')
  } catch (err) {
    Logger.log('onEditTrigger error: ' + err)
    toast_('Sync failed: ' + err, 'Bear Link — error')
  }
}

// ══════════════════════════════════════════════════════════════════════
// TRIGGERS
// ══════════════════════════════════════════════════════════════════════

function setupTrigger() {
  removeTrigger_()
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create()
  alert_('Bear Link', 'Live sync installed. Edits to the point tabs now update the website immediately.')
}

function removeTrigger() {
  removeTrigger_()
  alert_('Bear Link', 'Live sync removed. The sheet and the website will no longer update each other automatically.')
}

function removeTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditTrigger') ScriptApp.deleteTrigger(t)
  })
}
