# AfridiTech ERP — Wholesale Business Management (Multi-Trade)

A production-grade, multi-tenant ERP for Pakistani wholesale businesses — built around
the fabric trade but supporting **15 business types** (fabric, garments, general store,
services, pharmacy, electronics, hardware, auto, furniture, cosmetics, stationery, food,
jewelry, agriculture, tiles). Each trade gets correct units (kg/meter/pieces/…), labels
and stock behaviour chosen per business.

Every tenant gets: wholesale & retail billing with printable/PDF invoices (WhatsApp
delivery), fabric-style inventory with godowns and stock movements, customer khata &
ledgers, weekly **Ograi / recovery** schedules, supplier books & purchases with returns,
expenses, cash & bank with transfers, cheques, staff & payroll, salesmen & routes,
double-entry journal, P&L / trial balance / receivables / payables / party-ledger
reports, audit log, day closings, global search (`/`), bulk CSV import, CSV export,
nightly automatic backups, and a fully translated **EN / اردو / پښتو** interface.

Built with **Next.js 16 (App Router) + React 19 + PostgreSQL + Drizzle ORM + Tailwind 4**.

---

## 1. Requirements

| Tool | Version | Check with |
|---|---|---|
| Node.js | **20 or newer** (22 recommended) | `node -v` |
| npm | comes with Node | `npm -v` |
| PostgreSQL | 14 or newer | `psql --version` (or use Docker) |

If `node -v` fails → install Node from https://nodejs.org (pick the LTS version).

---

## 2. Install the app

Unzip the project, open a terminal **inside the project folder**, then:

```bash
npm install
```

---

## 3. Start PostgreSQL

The app expects this connection (already written in `.env` and `drizzle.config.json`):

```
postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

Pick **one** of the two options:

### Option A — Docker (easiest, works on Windows/Mac/Linux)

```bash
docker run --name faberp-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app_db -p 5432:5432 -d postgres:16
```

Done. (Later: `docker stop faberp-pg` / `docker start faberp-pg`.)

### Option B — PostgreSQL installed on your laptop

1. Install from https://www.postgresql.org/download/ (Windows/macOS installer) or
   `sudo apt install postgresql` (Linux).
2. During/after install make sure the `postgres` user has password `postgres`
   (or see "Different password?" below).
3. Create the database:

```bash
psql -U postgres -c "CREATE DATABASE app_db;"
```

**Different password?** Then edit these **two** files and put your own connection string
in both (keep them identical):

- `.env` → `DATABASE_URL=postgresql://YOURUSER:YOURPASSWORD@127.0.0.1:5432/app_db`
- `drizzle.config.json` → `dbCredentials.url`

---

## 4. Create tables + seed the demo business

Still in the project folder:

```bash
# create all 41 tables
npx drizzle-kit push

# seed the demo business: Afridi Fabrics Wholesale
# (customers, suppliers, fabrics, invoices, payments, ograi history…)
npx tsx scripts/seed.mts
```

Seeding takes ~1 minute. At the end it prints the demo login credentials.
It is safe to run again — it skips if the database is already seeded.

---

## 5. Run the app

**Development (hot reload):**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

Open **http://localhost:3000**

---

## 6. Sign in (demo account)

| Role | Email | Password |
|---|---|---|
| Demo control owner (permanent) | `demo@afriditech.pk` | `demo123` |

This account is permanent, cannot be disabled, and is the **only** account that can see
Settings → Demo Access / Owner Mailbox. Client accounts never see demo controls.
New businesses can also self-register from the login page ("Start Your Own Business")
— see [registration](#owner-controlled-business-registration-built-in-mail-system).

---

## 7. Everyday commands

```bash
npm run dev                 # start development server
npm run build && npm start  # production build + run
npm test                    # vitest suite (43 tests — money flow, auth, reports, dashboard)
npm run test:watch          # tests in watch mode
npm run lint                # eslint
npm run typecheck           # tsc --noEmit
npx drizzle-kit push        # apply schema changes after editing src/db/schema.ts
npx tsx scripts/seed.mts    # seed (only works on an empty database)
```

### Reset all data and re-seed from scratch

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npx drizzle-kit push
npx tsx scripts/seed.mts
```

(With Docker: `docker rm -f faberp-pg` then run the Docker command from step 3 again.)

---

## 8. Environment variables

All live in `.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `APP_URL` | Base URL used in links (optional) |
| `BACKUP_DIR` | Folder for **nightly automatic JSON backups** of every business (optional — unset = auto-backup off, manual backup still works) |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `OWNER_VERIFY_EMAIL` | Optional real-email delivery for verification/reset codes (nodemailer). Unset = codes land in the in-app Owner Mailbox only |
| `RESEND_API_KEY` | Optional fallback email provider |

---

## 9. Backups

- **Manual:** Settings → **Download full backup** produces a complete JSON snapshot of
  your business (documents, parties, stock, journal) anytime; a reminder nags gently
  until you do.
- **Automatic:** set `BACKUP_DIR` and every business gets a nightly JSON backup written
  to that folder (first run after 02:00 Karachi time, once per day).

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running. Start the Docker container or the PostgreSQL service (`sudo service postgresql start` on Linux; Services → postgresql on Windows). |
| `password authentication failed` | Your local postgres password differs — update `.env` **and** `drizzle.config.json` (step 3). |
| `database "app_db" does not exist` | `psql -U postgres -c "CREATE DATABASE app_db;"` or recreate the Docker container with `-e POSTGRES_DB=app_db`. |
| `DATABASE_URL is required` | The `.env` file is missing in the project root. Create it with: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db` |
| Port 3000 already in use | `npm run dev -- -p 3001` then open http://localhost:3001 |
| `relation "sales" does not exist` | You skipped `npx drizzle-kit push`. |
| Login page shows but nothing loads | Make sure you ran the seed, then hard-refresh the browser (Ctrl+Shift+R). |

---

## 11. Project map

```
src/
  db/schema.ts            # all 41 tables (Drizzle)
  db/index.ts             # db client (reads DATABASE_URL)
  server/
    services.mjs          # ★ business engine: sales, payments, purchases, returns,
                          #   stock movements, ograi schedules, expenses, journal posting,
                          #   ledgers, payroll — all inside DB transactions
    reports.mjs           # report queries (P&L, trial balance, party ledgers, dashboard)
    auth.mjs              # scrypt password hashing + sessions + rate limiting
    api.mjs               # route wrapper: auth + error envelope
    mail.mjs              # layered mail: in-app owner mailbox → SMTP → Resend
    migrate.mjs           # startup data migrations
    seed-demo.mjs         # demo business generator (used by scripts/seed.mts)
    __tests__/            # vitest suite: money flow, auth, reports, dashboard
  app/
    login/ reset/         # sign-in (incl. client demo access) + 3-step OTT password reset
    (app)/                # authenticated area (sidebar shell)
      dashboard/ customers/ sales/ purchases/ ograi/ inventory/
      suppliers/ expenses/ cashbank/ cheques/ reports/ settings/
    api/                  # REST endpoints: auth, register, sales, purchases, payments,
                          #   stock, returns, ograi, customers, suppliers, products,
                          #   expenses, cashbank, cheques, settings, search, export,
                          #   backup, health
  components/             # UI kit, billing screen, payment dialog, ledger view, shell,
                          #   barcode, i18n provider
  lib/
    i18n.js               # EN / اردو / پښتو dictionaries (audit: scripts/i18n-audit.mjs)
    businessTypes.js      # the 15 trade definitions (units, labels, stock behaviour)
scripts/seed.mts          # entry point for the demo seed
```

Every financial operation (sale, payment, purchase, return, adjustment, transfer, expense)
runs in a single database transaction that atomically updates the document, the party
khata balance, the godown stock + movement log, the cash/bank account and the
double-entry journal — everything rolls back together if any step fails.

---

## 12. Tests & quality gates

```bash
npm test        # 43 tests / 8 files — regression guards for the money flow,
                # auth & sessions, report math, dashboard queries (DB tests auto-skip
                # when PostgreSQL is unreachable)
npm run lint    # eslint (next config)
npm run typecheck
node scripts/i18n-audit.mjs   # every t() key used in the app must exist in ur + ps
```

---

## 13. Forgot Password — one-time code (OTT) flow

Login → **"Forgot password?"** → `/reset` — a 3-step flow (Email → Code → New password)
with a professional 6-box OTP entry (auto-advance, paste, backspace).

1. **Email** — enter the registered business email. The server issues a **6-digit OTT**
   (SHA-256 hashed, single-use, 10-minute expiry, rate-limited to 3 requests/minute).
2. **Delivery** uses the layered mail system (`src/server/mail.mjs`): the code is **always**
   stored in the platform owner's secure **in-app Owner Mailbox** (Settings → Owner Mailbox,
   owner role only). External delivery is then attempted **SMTP first** (nodemailer, sent to
   the requesting user's own address) and falls back to **Resend** (`RESEND_API_KEY`) when no
   SMTP is configured. The API reports `delivery: "email"` when the code actually reached an
   inbox, or `delivery: "mailbox"` when it is only waiting in the owner's mailbox — the reset
   screen words its message accordingly.
3. **No provider configured?** Nothing breaks: the code still lands in the owner's in-app
   mailbox, and the owner shares it with the person resetting. The code is **never** returned
   to the browser and **never** logged.
4. **New password** — enter the code, then set a new password (show/hide eye). All other
   sessions for that account are signed out and the account opens immediately at the dashboard.

Unknown emails receive a neutral response, so account existence is never revealed.

---

## 14. Owner-controlled business registration (built-in mail system)

When a client submits **"Start Your Own Business"**, the business + owner account are created in
**pending** state and a **6-digit verification code** is delivered through the ERP's **own mail
system** — no third-party service required:

1. **In-app Owner Mailbox** (always on): Settings → **Owner Mailbox** shows the verification
   email with the code in a copy-button. Only the platform owner role can see it. Codes are
   never shown to clients, logs, or public responses.
2. **Optional real email**: set `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS` (+`MAIL_FROM`,
   `OWNER_VERIFY_EMAIL`) in `.env` and the same message is also emailed via our own nodemailer
   SMTP transport. Delivery failures never block registration — the in-app mailbox always works.

The owner personally shares the code with the client; the client enters it on the registration
screen to activate the business and sign in. Codes: SHA-256 hashed in DB, 24 h expiry,
single-use, 5 wrong attempts lock, resend regenerates + invalidates the old code, rate-limited.
Pending businesses cannot sign in.

After activation the new owner picks a **business type** (one of the 15 trades) — this tunes
units, labels and stock behaviour across the whole app.

---

## 15. Demo access codes (owner workflow)

1. Sign in as the **demo control owner** → **Settings → Demo Access**.
2. Enter client name (+ optional email/note) and expiry (1/7/15/30 days) → **Grant demo access**.
   A unique `DEMO-XXXXXXXX` code is generated and shown once — **Copy** it or **Send WhatsApp**.
3. The client opens **/login**, enters the code in **Client demo access**, and gets a
   server-verified **demo session** (role `demo`) inside the isolated demo business.
4. Limits are enforced **server-side**: 5 new entries per module (sales, purchases,
   customers, suppliers, inventory, expenses). Remaining counts show in Settings and in
   the demo user's banner. Reads stay unlimited. Revoke/expire blocks new logins and
   kills active demo sessions.
5. Grants can be **Revoked**, **Reactivated**, or fully **Deleted** — deletion cleans up the
   hidden demo user and every database reference to it atomically.

---

## 16. Users & roles

Settings → **Users & Roles** manages the team: add users, **edit** any account
(name / email / phone / role), and enable/disable access. Guardrails are server-enforced:
no self-demotion, only the owner can touch owner accounts, the demo control account is
permanent, and every change is written to the Audit Log.

Roles: **owner** (full control) · **manager** (void/override/closings/settings) ·
**accountant** (money + closings) · **cashier** (payments) · **salesman** (billing + ograi)
· **warehouse** (stock adjustments).
