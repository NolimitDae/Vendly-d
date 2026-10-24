"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { isLoggedIn } from "@/lib/session";
import { ChatService } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";

const STYLE =
  "inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60";

/**
 * Starts (or reopens) a 1:1 chat with someone and goes to it. The server refuses a new chat while
 * either person has blocked the other; its plain reason is shown.
 */
export default function MessageButton({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!isLoggedIn()) {
    return (
      <Link href="/login" className={cn(STYLE, className)}>
        <MessageCircle className="w-4 h-4" />
        Log in to message
      </Link>
    );
  }

  const open = async () => {
    setBusy(true);
    try {
      const res = await ChatService.createConversation(userId);
      // a new chat answers with conversation_id, an existing one with id
      const id = res.data?.conversation?.id ?? res.data?.conversation?.conversation_id;
      if (!res.data?.success || !id) throw new Error();
      router.push(`/chat/${id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not open the chat. Please try again."));
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={open} disabled={busy} aria-label={`Message ${name}`} className={cn(STYLE, className)}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
      Message
    </button>
  );
}
