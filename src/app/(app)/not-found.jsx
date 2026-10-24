import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center max-w-md">
        <div className="tnum text-5xl font-bold text-ink">404</div>
        <h1 className="font-display text-xl font-bold mt-2">Record not found</h1>
        <p className="text-sm text-mute mt-2">
          This record does not exist in your business — it may have been voided, removed, or the link is outdated.
        </p>
        <div className="flex justify-center gap-2 mt-6">
          <Link href="/dashboard" className="rounded-lg bg-brand text-white text-sm font-bold px-4 py-2 hover:bg-brand-deep">Dashboard</Link>
          <Link href="/sales" className="rounded-lg border border-line bg-white text-sm font-bold px-4 py-2 hover:bg-paper">Sales</Link>
        </div>
      </div>
    </div>
  );
}
