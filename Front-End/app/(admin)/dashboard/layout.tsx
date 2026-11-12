import AdminMenu from "@/components/reusable/AdminMenu";
import Loader from "@/components/reusable/Loader";
import React, { Suspense } from "react";
import "../../globals.css";
import { Toaster } from "sonner";
import FileViewerHost from "@/components/shared/FileViewerHost";

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <Toaster position="top-center" richColors theme="dark" />
        <FileViewerHost />
        <Suspense fallback={<Loader />}>
          <AdminMenu>{children}</AdminMenu>
        </Suspense>
      </body>
    </html>
  );
}

export default AdminLayout;
