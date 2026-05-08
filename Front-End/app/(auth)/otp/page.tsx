import { Suspense } from "react";
import OTPPageContent from "./OTPPageContent";

export default function OTPPage() {
  return (
    <Suspense>
      <OTPPageContent />
    </Suspense>
  );
}
