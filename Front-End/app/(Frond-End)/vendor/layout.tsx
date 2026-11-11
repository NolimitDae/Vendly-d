import VendorSidebar from "@/components/vendor/dashboard/VendorSidebar";
import VendorOnly from "@/components/vendor/VendorOnly";

/**
 * Every vendor page gets the vendor menu: on the left on desktop, above the page on smaller screens.
 * Only for the vendor account: anyone else is sent to their own pages (VendorOnly).
 */
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <VendorOnly>
      <div className="bg-gray-50 dark:bg-gray-900 lg:flex">
        <VendorSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </VendorOnly>
  );
}
