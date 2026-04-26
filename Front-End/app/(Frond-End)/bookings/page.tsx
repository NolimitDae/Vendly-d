import { Suspense } from "react";
import CustomerBookingsPageContent from "./CustomerBookingsPageContent";

export default function CustomerBookingsPage() {
  return (
    <Suspense>
      <CustomerBookingsPageContent />
    </Suspense>
  );
}
