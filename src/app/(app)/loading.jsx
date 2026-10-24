import { Skeleton } from "@/components/ui";
import { BRAND } from "@/lib/brand.mjs";

export default function RouteLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-3">
        <img src={BRAND.mark} alt="" className="h-9 w-9 rounded-lg animate-pulse" />
        <div className="space-y-2 flex-1 max-w-xs">
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Skeleton className="h-64 lg:col-span-1" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
    </div>
  );
}
