# Transport Workforce Attendance & Location Tracking

A lightweight, mobile-first **web app** (not a native app — employees just open a link
in Chrome/Safari) for a transport company to record daily attendance of drivers and
helpers using face recognition, GPS location, and a truck number, with a secure
admin/HR dashboard and optional Google Sheets sync.

This version is set up to deploy on **Vercel**, using a free cloud Postgres database
(no SQLite file, since serverless hosts like Vercel don't have a persistent disk).

---

## 1. Technology stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express, running as a Vercel serverless function | Deploys straight from this folder with zero config |
| Database | Postgres (Vercel's built-in Storage, or any Postgres — Neon/Supabase also work) | Free tier available, survives redeploys, works from serverless functions |
| Face recognition | **face-api.js** running **in the employee's browser** | No GPU server needed. The browser computes a 128-number "face descriptor" and sends *only that* to the server — never the photo |
| Face matching | Server-side Euclidean distance comparison | Simple, fast, proven for small/medium headcounts |
| GPS | Browser Geolocation API | Built into every modern mobile browser |
| Reverse geocoding | OpenStreetMap Nominatim (free, no API key) | Zero cost |
| Admin auth | JWT + bcrypt password hashing | Standard, secure, no external auth service |
| Reporting layer | Google Sheets API (optional) | Lets managers see attendance in a spreadsheet they already know |

---

## 2. Deploying to Vercel (recommended path — no GitHub required)

You can deploy straight from your computer using the Vercel CLI, right from VS Code's
terminal. Requires **Node.js 18+** installed.

### Step 1 — Install dependencies

In this folder's terminal:
```bash
npm install
```

### Step 2 — Log in to Vercel

```bash
npx vercel login
```
This opens your browser to sign up/log in (free account, no card required for this).

### Step 3 — Deploy

```bash
npx vercel
```
Answer the prompts with the defaults (just press Enter for each) — it will:
- Ask to link to a new project → yes
- Ask the project name → accept default or type your own
- Detect this as a Node project automatically

This gives you a first preview URL like `https://transport-attendance-xxxx.vercel.app`.
**It won't fully work yet** — you still need to connect a database (next step) — but
this confirms the deploy pipeline itself works.

### Step 4 — Add a Postgres database

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → open your project
2. Click the **Storage** tab → **Create Database** → choose **Postgres** (powered by Neon) → follow the prompts to create it
3. On the "Connect to Project" step, connect it to this project — Vercel automatically
   adds the `POSTGRES_URL` environment variable for you. You don't need to copy/paste
   anything.

### Step 5 — Add the other environment variables

In your project → **Settings** → **Environment Variables**, add:

| Key | Value |
|---|---|
| `JWT_SECRET` | any long random string, e.g. `k8Jz9mQ2wPx7vT4rL1nY6bC3eF5aH0dG` |
| `TIMEZONE` | `Asia/Karachi` |
| `FACE_MATCH_THRESHOLD` | `0.5` |
| `GOOGLE_SHEETS_ENABLED` | `false` |

### Step 6 — Redeploy so the new settings take effect

```bash
npx vercel --prod
```

### Step 7 — Create your first admin login

The easiest way is to run the admin-creation script on your own computer, pointed at
the live cloud database:

```bash
npx vercel env pull .env
npm run create-admin -- "Your Name" "admin" "a-strong-password" "owner"
```

The first command downloads your live database's real connection string into a local
`.env` file; the second connects to that same live database and creates your admin
login in it.

### Step 8 — Try it

Visit the URL Vercel gave you (also shown any time you run `npx vercel` again, and in
your Vercel dashboard):
- `/attendance.html` — daily attendance flow
- `/register.html` — register a test employee first
- `/admin/login.html` — log in with the admin account you just created

From now on, whenever you make changes, just run `npx vercel --prod` again to update
the live site.

---

## 3. Running it locally (optional, for quick testing without deploying)

```bash
npm install
cp .env.example .env
# Fill in JWT_SECRET, and either POSTGRES_URL or DATABASE_URL pointing at any
# Postgres database (a free Neon/Supabase database works fine for this too,
# or run `npx vercel env pull .env` to reuse your live Vercel database)

npm run create-admin -- "Your Name" "admin" "a-strong-password" "owner"
npm start
```
Open `http://localhost:3000`. Camera/location permissions work on `localhost` without
HTTPS, but not over plain `http://` on any other address — use `ngrok http 3000` if you
want to test on your phone without deploying.

---

## 4. Project structure

```
transport-attendance/
  api/
    [...path].js           # Vercel serverless function — routes all /api/* here
  server/
    app.js                 # Express app (routes, middleware) — shared by local + Vercel
    index.js                # Local-dev entry point only (npm start)
    db.js                    # Postgres connection + schema (auto-creates tables)
    middleware/auth.js        # JWT auth guard for admin routes
    routes/
      auth.js                # admin login
      employees.js           # registration + admin employee management
      attendance.js           # mark attendance, identify, history, monthly summary, export
    services/
      faceMatch.js            # face descriptor comparison
      geocode.js               # reverse geocoding (Nominatim)
      sheets.js                 # Google Sheets sync
    scripts/createAdmin.js    # CLI to create an admin login
  public/
    index.html               # landing page
    register.html / js/register.js       # one-time employee registration
    attendance.html / js/attendance.js   # daily attendance flow
    admin/login.html + dashboard.html    # admin/HR module
    js/face-utils.js          # shared face-api.js camera/model helpers
    js/admin-dashboard.js
    css/style.css
  package.json
  .env.example
```

---

## 5. Setting up Google Sheets sync (optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. Enable the **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create Service Account** (no special roles needed).
4. Open it → **Keys → Add Key → Create new key → JSON** — this downloads a `.json` file.
5. Open that file in a text editor, select all, copy it.
6. In Vercel → Settings → Environment Variables, add `GOOGLE_SERVICE_ACCOUNT_JSON` and
   paste the entire JSON as its value.
7. Create/open a Google Sheet, click **Share**, and share it with the service account's
   `client_email` (found inside the JSON), with **Editor** access.
8. Copy the Sheet ID from its URL (`.../spreadsheets/d/THIS_PART/edit`).
9. Add these env vars too: `GOOGLE_SHEETS_ENABLED=true`, `GOOGLE_SHEET_ID=<paste it>`.
10. Redeploy (`npx vercel --prod`).

If Sheets sync ever fails, attendance is **still saved to the database** — it never
blocks or loses a record because of a Sheets outage.

---

## 6. Face recognition notes

- Models load in the browser at runtime from a public CDN
  (`justadudewhohacks.github.io/face-api.js/models`). Fine for getting started; for
  production reliability independent of a third party, download the weight files once
  and serve them from `public/models/` instead, then change `MODEL_URL` in
  `public/js/face-utils.js` to `/models`.
- `FACE_MATCH_THRESHOLD` (default `0.5`) controls strictness. Lower = stricter. Raise
  to ~0.55 if real employees are frequently not recognized; lower to ~0.45 if two
  different people are ever matched as the same person.
- A short blink-detection step runs before capture as a lightweight deterrent against
  someone holding up a printed photo — a real improvement over a single static
  snapshot, but not bank-grade anti-spoofing.
- No raw photos are ever stored or sent to the server — only the numeric face
  descriptor.

---

## 7. How the required flows map to the code

- **Employee registration (one-time)** → `public/register.html` + `POST /api/employees/register`
- **Daily attendance** → `public/attendance.html` + `POST /api/attendance/identify`
  (greets by name) + `POST /api/attendance/mark` (saves the record)
- **Duplicate prevention** → enforced both in application logic and a Postgres
  `UNIQUE(employee_id, date)` constraint
- **Truck stored per attendance, not per employee** → `attendance.truck_number`,
  entered fresh every day
- **Reverse geocoding** → `server/services/geocode.js`, called inside `POST /api/attendance/mark`
- **Google Sheets row per attendance** → `server/services/sheets.js`, called inside the same route
- **Monthly Present/Absent grid** → `GET /api/attendance/monthly-summary`
- **Truck-based filtering/history** → `GET /api/attendance?truck=...` (also filters by
  employee, date range, city, status)
- **Secure admin dashboard** → `server/middleware/auth.js` (JWT) guards every admin
  route; the dashboard redirects to login if there's no valid token
- **Offline handling** → employee pages check `navigator.onLine` and show "Internet
  connection required..." instead of a false success
- **Re-registering a face profile** → admin dashboard → Employees tab → "Reset Face"

---

## 8. Security notes

- No API keys, database credentials, or Google credentials are ever sent to the
  browser — they stay server-side, read from Vercel's Environment Variables.
- Admin passwords are hashed with bcrypt, never stored in plain text.
- Every admin API route requires a valid JWT.
- Attendance date/time are computed **server-side**, so an employee's device clock
  can't be used to bypass duplicate prevention.
