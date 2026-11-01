"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Loader2, Mail } from "lucide-react";
import { toast } from "react-toastify";
import { ContactMessagesService, type ContactMessage } from "@/service/admin/contact-messages.service";
import { SUPPORT_EMAIL } from "@/lib/support";

const nameOf = (m: ContactMessage) => [m.first_name, m.last_name].filter(Boolean).join(" ") || "No name given";

/** Messages from the website's Contact us form, newest first. Each also arrives in the support inbox. */
export default function ContactMessagesContent() {
  const [rows, setRows] = useState<ContactMessage[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (search?: string) => {
    try {
      const res = await ContactMessagesService.list(search);
      setRows(res.data?.data ?? []);
    } catch {
      toast.error("Couldn't load the contact messages");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (m: ContactMessage) => {
    if (!confirm(`Delete the message from ${nameOf(m)}?`)) return;
    setBusy(m.id);
    try {
      await ContactMessagesService.remove(m.id);
      setRows((r) => r?.filter((x) => x.id !== m.id) ?? r);
    } catch {
      toast.error("Couldn't delete the message");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-descriptionColor">
        Each message is also emailed to <span className="font-medium text-blackColor">{SUPPORT_EMAIL}</span>; replying there answers the sender.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRows(null);
          load(q.trim() || undefined);
        }}
        className="flex gap-2"
      >
        <input
          aria-label="Search by name, email or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email or phone"
          className="flex-1 px-3 py-2 rounded-lg border border-borderColor bg-transparent text-blackColor text-sm"
        />
        <button type="submit" className="px-4 py-2 rounded-lg gradient-bg text-white text-sm font-semibold">
          Search
        </button>
      </form>

      {rows === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-descriptionColor py-6 text-center">No messages yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-xl border border-borderColor p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-blackColor">{nameOf(m)}</p>
                  <p className="text-xs text-descriptionColor">
                    {m.email}
                    {m.phone_number ? ` · ${m.phone_number}` : ""} · {dayjs(m.created_at).format("MMM D, YYYY h:mm A")}
                  </p>
                </div>
                <div className="flex gap-3 text-sm font-semibold">
                  {m.email && (
                    <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message to Vendly")}`} className="inline-flex items-center gap-1 text-primary">
                      <Mail className="w-4 h-4" /> Reply
                    </a>
                  )}
                  <button type="button" disabled={busy === m.id} onClick={() => remove(m)} className="text-descriptionColor disabled:opacity-50">
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-blackColor whitespace-pre-wrap">{m.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
