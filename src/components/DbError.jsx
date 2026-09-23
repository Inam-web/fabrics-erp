// Shown instead of a crash whenever the PostgreSQL connection is broken.
// Pure server markup — no hooks, safe to render from layouts on DB failure.
export default function DbError({ reason }) {
  const text = String(reason || "");
  const hint = text.includes("password authentication failed")
    ? { title: "Wrong database password", body: <>The password in your <code>.env</code> file does not match your local PostgreSQL. Either reset the postgres password to <code>postgres</code> (Option A below) or put your real password into <code>.env</code> <b>and</b> <code>drizzle.config.json</code>.</> }
    : text.includes("ECONNREFUSED")
    ? { title: "PostgreSQL is not running", body: <>Start PostgreSQL: Docker → <code>docker start faberp-pg</code> · Windows → Services → start <i>postgresql-x64</i> · Linux → <code>sudo service postgresql start</code>.</> }
    : text.includes("does not exist")
    ? { title: "Database “app_db” not found", body: <>Create it once: <code>psql -U postgres -c "CREATE DATABASE app_db;"</code>, then run <code>npx drizzle-kit push</code> and <code>npx tsx scripts/seed.mts</code>.</> }
    : { title: "Database connection problem", body: <>Check that PostgreSQL is running and that <code>DATABASE_URL</code> in <code>.env</code> is correct.</> };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6" style={{ fontFamily: "Manrope, system-ui, sans-serif" }}>
      <div className="max-w-xl w-full rounded-xl border border-line bg-white shadow-sm p-6">
        <div className="flex items-center gap-3">
          <svg width="38" height="38" viewBox="0 0 34 34" fill="none" aria-hidden>
            <rect x="1" y="1" width="32" height="32" rx="8" fill="#0d6b57" />
            <path d="M8 22c2.5-6 5-9 9-9s6.5 3 9 9" stroke="#f3f1e9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <circle cx="17" cy="24.5" r="1.8" fill="#f3f1e9" />
          </svg>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', Manrope, sans-serif" }}>Can't reach the database</h1>
            <div className="text-sm text-[#6d7264]">The app is fine — it just can't talk to PostgreSQL yet.</div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-[#f0d9a8] bg-[#fdf6e8] px-4 py-3">
          <div className="font-bold text-sm text-[#8a5a00]">{hint.title}</div>
          <div className="text-sm mt-1 text-[#6d5527] leading-relaxed">{hint.body}</div>
        </div>

        <div className="mt-5 text-sm space-y-3">
          <div>
            <div className="font-bold mb-1">Option A — make your PostgreSQL match the app (easiest)</div>
            <pre className="rounded-md bg-[#16211b] text-[#cfdcd3] text-xs p-3 overflow-x-auto">{`psql -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
psql -U postgres -c "CREATE DATABASE app_db;"`}</pre>
            <div className="text-xs text-[#6d7264] mt-1">Windows: use “SQL Shell (psql)” from the Start menu. Then hard-refresh this page (Ctrl+Shift+R).</div>
          </div>
          <div>
            <div className="font-bold mb-1">Option B — point the app at your password</div>
            <pre className="rounded-md bg-[#16211b] text-[#cfdcd3] text-xs p-3 overflow-x-auto">{`# .env  (and the same string in drizzle.config.json)
DATABASE_URL=postgresql://postgres:YOUR_REAL_PASSWORD@127.0.0.1:5432/app_db`}</pre>
            <div className="text-xs text-[#6d7264] mt-1">After editing, restart: <code>npm run dev</code></div>
          </div>
          <div>
            <div className="font-bold mb-1">Then, once the connection works, run:</div>
            <pre className="rounded-md bg-[#16211b] text-[#cfdcd3] text-xs p-3 overflow-x-auto">{`npx drizzle-kit push      # create tables (first time only)
npx tsx scripts/seed.mts  # load the demo business (first time only)`}</pre>
          </div>
        </div>

        {text && (
          <details open className="mt-4 text-xs text-[#6d7264]">
            <summary className="cursor-pointer font-semibold">Technical details</summary>
            <div className="mt-1 break-all">{text}</div>
          </details>
        )}
      </div>
    </div>
  );
}
