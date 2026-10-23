import AdminMenu from "@/components/reusable/AdminMenu";
import Loader from "@/components/reusable/Loader";
import React, { Suspense } from "react";
import "../../globals.css";
import { Toaster } from "sonner";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <Toaster position="top-center" richColors theme="dark" />
        {/* many dashboard pages report with react-toastify; without its container those messages never showed */}
        <ToastContainer position="top-center" theme="dark" />
        <Suspense fallback={<Loader />}>
          <AdminMenu>{children}</AdminMenu>
        </Suspense>
      </body>
    </html>
  );
}

export default AdminLayout;
