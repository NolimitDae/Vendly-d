"use client";

import { MessageSquare } from "lucide-react";
import ConversationSidebar from "./_components/ConversationSidebar";

export default function ChatInboxPage() {
  return (
    <>
      {/* Mobile: full-screen conversation list */}
      <div className="md:hidden h-full bg-white dark:bg-gray-800">
        <ConversationSidebar />
      </div>

      {/* Desktop: empty state — sidebar handles the list */}
      <div className="hidden md:flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 text-center px-8">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <MessageSquare className="w-9 h-9 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Your messages
        </h2>
        <p className="text-sm text-gray-400 max-w-xs">
          Select a conversation from the sidebar to start messaging.
        </p>
      </div>
    </>
  );
}
