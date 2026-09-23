# Afridi Fabrics — Wholesale Fabric Business ERP

A production-grade ERP for a Pakistani wholesale fabric shop: wholesale billing, fabric
inventory with godowns, customer khata & ledgers, weekly **Ograi / recovery** tracking,
supplier books, purchases, expenses, cash & bank, cheques, double-entry journal,
P&L / receivables / payables reports, audit log, roles and EN/اردو/پښتو UI.

Built with **Next.js (App Router) + PostgreSQL + Drizzle ORM**.

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
# create all 35 tables
npx drizzle-kit push

# seed the demo business: Afridi Fabrics Wholesale
# (55 customers, 16 suppliers, 120 fabrics, ~410 invoices, payments, ograi history…)
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

## 6. Sign in (demo accounts)

| Role | Email | Password |
|---|---|---|
| Owner | `owner@afridifabrics.pk` | `afridi123` |

Or just click one of the demo account buttons on the login screen.

---

## 7. Everyday commands

```bash
npm run dev                 # start development server
npm run build && npm start  # production build + run
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

## 8. Troubleshooting

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

## 9. Project map

```
src/
  db/schema.ts            # all 35 tables (Drizzle)
  db/index.ts             # db client (reads DATABASE_URL)
  server/
    services.mjs          # ★ business engine: sales, payments, purchases, returns,
                          #   stock movements, ograi schedules, expenses, journal posting,
                          #   ledgers, reports — all inside DB transactions
    auth.mjs              # scrypt password hashing + sessions + rate limiting
    api.mjs               # route wrapper: auth + error envelope
  app/
    login/                # sign-in
    (app)/                # authenticated area (sidebar shell)
      dashboard/ customers/ sales/ purchases/ ograi/ inventory/
      suppliers/ expenses/ cashbank/ cheques/ reports/ settings/
    api/                  # REST endpoints (auth, sales, payments, stock, ograi, …)
  components/             # UI kit, billing screen, payment dialog, ledger view, shell
scripts/seed.mts          # demo business generator (runs through the real services)
```

Every financial operation (sale, payment, purchase, return, adjustment, transfer, expense)
runs in a single database transaction that atomically updates the document, the party
khata balance, the godown stock + movement log, the cash/bank account and the
double-entry journal — everything rolls back together if any step fails.
