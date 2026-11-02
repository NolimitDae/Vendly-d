import { Skeleton } from "@/components/ui/skeleton";

/** The outline of a package page while it loads: photo, title, details and the booking card. */
export function ListingPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8" aria-busy="true" aria-label="Loading">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="w-full aspect-[16/10] rounded-2xl" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
        <div className="space-y-3 rounded-2xl bg-white dark:bg-gray-800 p-6 h-fit">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** The outline of a vendor's shop while it loads: banner, logo and name, then package cards. */
export function ShopPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-full h-48 md:h-64 rounded-none" />
      <div className="max-w-6xl mx-auto px-4 md:px-8 -mt-10 space-y-6">
        <div className="flex items-end gap-4">
          <Skeleton className="w-24 h-24 rounded-2xl border-4 border-gray-50 dark:border-gray-900" />
          <div className="space-y-2 pb-2 flex-1">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
        <CardGridSkeleton />
      </div>
    </div>
  );
}

/** A grid of loading cards (photo and two lines), for lists of packages or planners. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl bg-white dark:bg-gray-800 overflow-hidden">
          <Skeleton className="w-full aspect-[4/3] rounded-none" />
          <div className="p-4 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
