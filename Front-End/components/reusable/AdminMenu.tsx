"use client";

import Header from "@/components/reusable/Header";
import Sidebar from "@/components/reusable/Sidebar";
import React, { useState } from "react";
import { ToastContainer } from "react-toastify";

function AdminMenu({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="w-full h-screen overflow-hidden relative">
      <div className="relative flex h-full">
        {/* Sidebar */}
        <div
          className={`
            fixed top-0 left-0 h-screen z-30 bg-bgColor border-r border-borderColor
            transition-transform duration-300 ease-in-out w-[300px]
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            xl:static xl:translate-x-0
          `}
        >
          <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        </div>
        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs xl:hidden z-20"
            onClick={closeSidebar}
          />
        )}

        <div className="flex-1 h-full flex flex-col min-w-0 min-h-0 ">
          <div className="w-full sticky top-0 left-0 z-10">
            <Header sidebarOpen={sidebarOpen} onMenuClick={toggleSidebar} />
          </div>

          {/* Main content area */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden text-headerColor p-3 lg:p-5 min-w-0">
            {children}
            <ToastContainer />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AdminMenu;
