import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand shadow-lg">
          <svg width="30" height="30" viewBox="0 0 34 34" fill="none">
            <path d="M8 22c2.5-6 5-9 9-9s6.5 3 9 9" stroke="#f3f1e9" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <circle cx="17" cy="24.5" r="2" fill="#e8c98a" />
          </svg>
        </div>
        <div className="tnum text-5xl font-bold text-ink">404</div>
        <h1 className="font-display text-xl font-bold mt-2">Page not found</h1>
        <p className="text-sm text-mute mt-2">
          The record or page you requested does not exist (it may have been voided, removed, or the link is outdated).
        </p>
        <div className="flex justify-center gap-2 mt-6">
          <Link href="/dashboard" className="rounded-lg bg-brand text-white text-sm font-bold px-4 py-2 hover:bg-brand-deep">Go to Dashboard</Link>
          <Link href="/login" className="rounded-lg border border-line bg-white text-sm font-bold px-4 py-2 hover:bg-paper">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
