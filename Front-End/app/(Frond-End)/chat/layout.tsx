import ConversationSidebar from "./_components/ConversationSidebar";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    // the visible screen (dvh), so on iPhone the message box isn't hidden behind Safari's toolbar
    <div className="flex h-[calc(100vh-88px)] supports-[height:100dvh]:h-[calc(100dvh-88px)]">
      {/* Conversation sidebar — desktop only */}
      <div className="hidden md:flex md:flex-col md:w-80 lg:w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <ConversationSidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
