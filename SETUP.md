# Bear Link — Setup & Operations

Bear Link keeps two things in step:

* the **Google Sheet** (`2025 - 2026 FBLA Points System`) — where officers log points
* the **website** (Supabase + these HTML pages) — the leaderboard and admin dashboard

Either side can be edited and the other catches up.

---

## Deploying the repair (do this first, in order)

The sync had drifted badly. These four steps bring both sides back in line.

### 1. Run the repair migration

Supabase Dashboard → **SQL Editor** → paste and run
`supabase/migrations/002_repair_and_harden.sql`.

It is idempotent — running it twice is safe. It:

* deletes the ~39 fake "events" that were really spreadsheet formula and
  subtotal columns (`Attendance Formula`, `# of Socials Participated In`, `|`, …)
* merges the 14 duplicate `SilverCrest` events and the duplicate meeting events
* adds a unique index so duplicates cannot come back
* fixes point values (conferences 12, Everfi 18, Capstone 20)
* backfills event dates from the `M/D` in each event name
* recalculates every member's total from their assignments

Verify with the queries commented at the bottom of the file.

### 2. Deploy both edge functions

```bash
supabase login
supabase link --project-ref lrnlqdxudmoszlaeatst

# Called by the website. The admin's login token is checked, so it needs JWT verification ON.
supabase functions deploy sync-to-sheets

# Called by Apps Script, which has no login. It authenticates with a shared secret instead.
supabase functions deploy sheet-sync --no-verify-jwt
```

> The `--no-verify-jwt` flag belongs on **`sheet-sync` only**. Putting it on
> `sync-to-sheets` would let anyone on the internet write to the spreadsheet.

### 3. Update the Apps Script

Open the sheet → **Extensions → Apps Script** → replace everything with
`google-apps-script/Code.gs` → Save → reload the spreadsheet.

A **Bear Link** menu appears. Then, in order:

1. **Setup → Set sync secret** — paste `SHEET_SYNC_SECRET`
2. **Setup → Check connection** — should report the member count
3. **Repair sheet headers** — fixes the corrupted `A1` cells
   (the Services tab literally contained
   `supabase functions deploy sync-to-sheets --no-verify-jwt`, and the
   Attendance tab contained `Atte`)
4. **Health check** — confirms every tab is found and readable
5. **Import sheet into website** — makes the website match the sheet exactly
6. **Setup → Install live sync** — turns on the onEdit trigger

### 4. Confirm from the website

Sign in to `admin.html` and press **Check now** in the Google Sheet panel.
It should list every category with the tab it resolved to and the member count.

---

## Secrets

Supabase Dashboard → **Edge Functions → Secrets**:

| Key | Value |
|-----|-------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `xxx@xxx.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | the `private_key` from the service-account JSON, `\n` escapes intact |
| `GOOGLE_SHEET_ID` | `1tHgs43YZz4nver4kH4QYXOpJpSX_s9a0K9ff5tSHQFE` |
| `SHEET_SYNC_SECRET` | any random string; the same value goes into Apps Script |

The spreadsheet must be shared with the service-account email as **Editor**.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### Creating an admin

```sql
insert into public.admin_profiles (id, name)
select id, email from auth.users
where email = 'your-admin-email@example.com';
```

Only accounts with a row here can reach the admin pages or write to the sheet.

---

## How the two sides map to each other

| Category | Sheet tab | Cell means | Points |
|---|---|---|---|
| Attendance | `Attendance` | count of meetings | 2 each |
| Social | `Social` | points | as entered |
| Service | `Services` | points | as entered |
| Fundraising | `Fundraising` | points | as entered |
| Conference | `Conferences` | 1 = attended | 12 |
| BAA | `BAA` | 1 = earned | 6, Everfi 18, Capstone 20 |
| Committee | `Committee Meetings` | points | as entered |
| Miscellaneous | `Points in General` | points | as entered |

Tab names are matched loosely, so renaming `Services` to `Service Projects`
will not break anything.

**Columns that are never treated as events:** anything whose header starts
with `Total`, `Sum`, `#` or `Points for`, anything ending in `Formula`, the
`(x2)`-style multiplier columns, and any column whose cells contain formulas.
Those are computed by the sheet and importing them was what inflated the
website's event list.

---

## Everyday tasks

### Add a member
`admin.html` → **Add Member**. Creates them in the database and appends a row
to every tab of the spreadsheet, copying the formulas from the row above so
their subtotals work immediately.

### Add an event
`admin.html` → **Add New Event**. Pick the category (this decides the tab), set
the date and point value. A new column is inserted on that tab, just before
the subtotal column, and zero-filled. You are then taken straight to the
assign-points screen.

### Award points
`admin-assign.html` — select members, optionally change any individual's
amount, submit. The database is written first, then each sheet cell; if a cell
write fails you get a per-member report rather than a silent failure.

To give one member points for something, use **Award Points** on their
`admin-member.html` page instead.

### Fix a member whose sheet and site disagree
Their page → **Re-push all to sheet**.

### Fix a whole tab
In the sheet: **Bear Link → Push one tab to website** (while that tab is open).

---

## Safety rules built into the sync

* **Formulas are never overwritten.** If a write targets a cell containing a
  formula, it is refused with an explanatory error instead of destroying it.
* **Clearing a cell clears the points.** A full tab import replaces that
  column's assignments outright, so deleting a value in the sheet removes the
  points on the site. This did not used to happen.
* **Attendance counts are set, not incremented.** The old code added 1 to the
  meeting count on every sync, including deletions.
* **0 points means no assignment.** Zero rows are deleted rather than stored.
* **Duplicate events are impossible.** Enforced by a unique index on
  `(lower(name), category)`.

---

## Hosting

The site is plain static HTML:

* **Netlify** — drag the folder to [app.netlify.com/drop](https://app.netlify.com/drop)
* **GitHub Pages** — push and enable Pages in Settings

---

## File map

```
fbla-website/
├── index.html                    Home
├── points.html                   Public leaderboard
├── member.html                   Public member detail (?id=UUID)
├── login.html                    Admin login
├── admin.html                    Dashboard: members, events, sheet status, chapter report
├── admin-assign.html             Award an event to many members
├── admin-member.html             One member: details, award points, edit/remove, re-push
├── competitive-events.html       Events info
├── resources.html                Resources
├── js/
│   ├── supabase-client.js        Project URL + anon key
│   ├── auth.js                   Session + admin gate
│   └── data.js                   All database and sheet-sync calls
├── supabase/
│   ├── schema.sql                Original schema (first install only)
│   ├── migrations/
│   │   ├── 001_update_schema.sql first_name/last_name + categories
│   │   └── 002_repair_and_harden.sql   ← the repair
│   └── functions/
│       ├── sync-to-sheets/       website -> sheet   (admin JWT required)
│       └── sheet-sync/           sheet -> website   (shared secret)
└── google-apps-script/
    └── Code.gs                   Paste into the sheet's Apps Script editor
```
