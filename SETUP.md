# Bear Link — Backend Setup Guide

## 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. **SQL Editor** → paste and run `supabase/schema.sql`
3. Note your **Project URL** and **anon/public key** (Settings → API)
4. Paste both into `js/supabase-client.js`

### Create the first admin account

In Supabase Dashboard → **Authentication → Users → Invite user**, enter your email.
Then in **SQL Editor** run:

```sql
insert into public.admin_profiles (id, name)
select id, email from auth.users
where email = 'your-admin-email@example.com';
```

---

## 2. Google Sheets Sync

### Site → Sheet (automatic when DB changes)

1. **Create a Google Service Account**
   - [console.cloud.google.com](https://console.cloud.google.com) → IAM & Admin → Service Accounts → Create
   - Enable the **Google Sheets API** for your project
   - Create a JSON key → download it

2. **Share your spreadsheet** with the service account email (`xxx@xxx.iam.gserviceaccount.com`) as **Editor**

3. **Store secrets** in Supabase → Edge Functions → Secrets:
   | Key | Value |
   |-----|-------|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | service account email |
   | `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON (keep `\n` as-is) |
   | `GOOGLE_SHEET_ID` | the ID in your sheet URL (`/d/XXXXXX/edit`) |
   | `GOOGLE_SHEET_TAB` | tab name, e.g. `Points` |

4. **Deploy the Edge Function** (requires [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_ID
   supabase functions deploy sync-to-sheets --no-verify-jwt
   ```

5. **Create a Database Webhook** in Supabase Dashboard → Database → Webhooks:
   - Table: `members` | Events: ✅ INSERT ✅ UPDATE ✅ DELETE
   - URL: `https://YOUR_PROJECT_ID.supabase.co/functions/v1/sync-to-sheets`
   - Method: POST

### Sheet → Site (when you edit the Google Sheet)

1. Open your Google Sheet → **Extensions → Apps Script**
2. Paste the contents of `google-apps-script/Code.gs`
3. Update `SUPABASE_URL` and `SUPABASE_KEY` at the top
4. Run `setupTrigger()` once (Run menu → setupTrigger)
5. Run `initialImport()` once to pull current DB data into the sheet

From now on, editing any cell in columns B–F (Name, Grade, Student ID, Email, Points) will automatically upsert that row into Supabase.

---

## 3. Hosting (optional)

The site is plain HTML — drop it anywhere:
- **Netlify**: drag the folder to [app.netlify.com/drop](https://app.netlify.com/drop)
- **GitHub Pages**: push to a repo, enable Pages in Settings
- **Supabase Storage**: not recommended for HTML hosting

---

## File Map

```
fbla-website/
├── index.html                  Home
├── competitive-events.html     Events
├── resources.html              Resources
├── points.html                 Live leaderboard (Supabase)
├── member.html                 Member detail (Supabase, ?id=UUID)
├── login.html                  Admin login
├── admin.html                  Admin dashboard (auth-gated)
├── admin-assign.html           Assign event points (auth-gated)
├── js/
│   ├── supabase-client.js      ← PUT YOUR KEYS HERE
│   ├── auth.js                 Auth helpers
│   └── data.js                 DB query helpers
├── supabase/
│   ├── schema.sql              Run once in Supabase SQL Editor
│   └── functions/
│       └── sync-to-sheets/
│           └── index.ts        Edge Function (deploy via CLI)
└── google-apps-script/
    └── Code.gs                 Paste into Apps Script editor
```
