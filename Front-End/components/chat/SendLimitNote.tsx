import { Clock } from "lucide-react";
import type { SendLimit } from "@/service/chat/chat.service";

/** True once a customer has used their messages before the vendor replies. */
export const sendLimitReached = (limit: SendLimit | null | undefined) => !!limit && limit.remaining <= 0;

/**
 * Shown above the composer while a customer waits for a vendor's first reply: a subtle count after
 * their first message, and a note once they've used them all (sending is off until the reply).
 */
export default function SendLimitNote({ limit }: { limit: SendLimit | null | undefined }) {
  if (!limit || limit.used < 1) return null;
  if (sendLimitReached(limit)) {
    return (
      <div role="status" className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm border-t border-gray-200 dark:border-gray-700">
        <Clock className="w-4 h-4 flex-shrink-0" />
        <span>
          You&apos;ve sent {limit.limit} messages. You can send more once {limit.vendor_name} replies.
        </span>
      </div>
    );
  }
  return (
    <p role="status" className="px-4 pt-2 text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
      {limit.remaining} {limit.remaining === 1 ? "message" : "messages"} left until they reply
    </p>
  );
}
