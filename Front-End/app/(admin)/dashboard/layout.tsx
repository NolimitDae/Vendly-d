import AdminMenu from "@/components/reusable/AdminMenu";
import Loader from "@/components/reusable/Loader";
import React, { Suspense } from "react";
import "../../globals.css";
import { Toaster } from "sonner";

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <Toaster position="top-center" richColors theme="dark" />
        <Suspense fallback={<Loader />}>
          <AdminMenu>{children}</AdminMenu>
        </Suspense>
      </body>
    </html>
  );
}

export default AdminLayout;
