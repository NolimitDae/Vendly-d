import type { InboxCounts, InboxTab } from "@/service/chat/chat.service";

const TABS: { key: InboxTab; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "inquiries", label: "Inquiries" },
];

/**
 * A vendor's inbox split in two (sorted on the server): Clients (customers with a booking or booking
 * request) and Inquiries (everyone else), each with its unread chats. Same pills as the bookings tabs.
 */
export default function InboxTabs({ tab, counts, onChange }: { tab: InboxTab; counts: InboxCounts | null; onChange: (tab: InboxTab) => void }) {
  return (
    <div role="tablist" aria-label="Inbox" className="flex gap-2 mt-3">
      {TABS.map((t) => {
        const on = tab === t.key;
        const unread = counts?.[t.key].unread ?? 0;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              on
                ? "bg-primary text-primary-foreground"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {t.label}
            {unread > 0 && (
              <span
                aria-label={`${unread} unread`}
                className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center ${on ? "bg-white/25 text-white" : "bg-primary text-primary-foreground"}`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
