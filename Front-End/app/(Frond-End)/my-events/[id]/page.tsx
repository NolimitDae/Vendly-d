"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Loader2, MapPin, MessagesSquare, User } from "lucide-react";
import dayjs from "dayjs";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { CookieHelper } from "@/helper/cookie.helper";
import RunOfShow from "@/components/events/RunOfShow";
import EventFiles from "@/components/events/EventFiles";
import ClientContractsList from "@/components/contracts/ClientContractsList";
import { EventToolsService, usd, type EventOverview } from "@/service/events/eventTools.service";
import { ChatService } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";

type Section = "schedule" | "vendors" | "files" | "contracts";

const userIdFromToken = () => {
  try {
    const t = CookieHelper.get({ key: "token" });
    return t ? (JSON.parse(atob(t.split(".")[1])).sub as string) : null;
  } catch {
    return null;
  }
};

/** An event as a booked vendor or the planner's client sees it. */
export default function SharedEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ev, setEv] = useState<EventOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("schedule");
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(() => {
    EventToolsService.overview(id)
      .then((r) => (r.data?.success ? setEv(r.data.data) : setError(r.data?.message ?? "Event not found")))
      .catch((e) => setError(errorMessage(e, "You don’t have access to this event")));
  }, [id]);

  useEffect(() => {
    setMe(userIdFromToken());
    load();
  }, [load]);

  const openChat = async () => {
    try {
      const r = await ChatService.openEventChat(id);
      router.push(`/chat/${r.data?.data?.conversation_id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not open the event chat"));
    }
  };

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-gray-600 dark:text-gray-300 max-w-sm">{error}</p>
        <p className="text-sm text-gray-400 max-w-sm">If your planner shared this with you, sign in with the email address they used.</p>
        <Link href="/my-events" className="text-primary hover:underline text-sm">Shared events</Link>
      </div>
    );
  }
  if (!ev) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href={ev.role === "vendor" ? "/vendor/bookings" : "/my-events"} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white dark:text-gray-400">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{ev.name}</h1>
            {ev.role === "vendor" && (
              <button onClick={openChat} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/40 text-primary text-sm font-medium hover:bg-primary/5">
                <MessagesSquare className="w-4 h-4" /> Event chat
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
            {ev.date && <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary" />{dayjs(ev.date).format("dddd D MMMM YYYY")}</span>}
            {ev.venue && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />{ev.venue}</span>}
            {ev.planner && <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-primary" />Planned by {ev.planner.name}</span>}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {ev.role === "vendor" ? "You’re booked for this event. Items marked for you are highlighted; tick them off on the day." : "Your planner shared this event with you. You can follow along; changes go through your planner."}
          </p>
        </div>

        <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-1.5" role="tablist">
          {((ev.role === "client" ? ["schedule", "vendors", "files", "contracts"] : ["schedule", "vendors", "files"]) as Section[]).map((k) => (
            <button key={k} role="tab" aria-selected={section === k} onClick={() => setSection(k)} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition", section === k ? "bg-primary text-primary-foreground" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700")}>
              {k === "schedule" ? "Run of show" : k === "vendors" ? `Vendors (${ev.vendors.length})` : k === "files" ? `Files (${ev.file_count})` : "Contracts"}
            </button>
          ))}
        </div>

        {section === "schedule" && <RunOfShow eventId={ev.id} eventDate={ev.date} role={ev.role} userId={me} items={ev.timeline} vendors={[]} onChanged={load} />}
        {section === "vendors" && (
          <ul className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {ev.vendors.length === 0 && <li className="p-6 text-sm text-gray-500 text-center">No vendors booked yet.</li>}
            {ev.vendors.map((v) => (
              <li key={v.booking_id} className="flex items-center gap-3 p-4">
                <span className="w-10 h-10 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center">{v.vendor.name[0]?.toUpperCase()}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-gray-900 dark:text-white">{v.vendor.id === me ? `${v.vendor.name} (you)` : v.vendor.name}</span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">{v.service} · {v.status.toLowerCase().replace("_", " ")}</span>
                </span>
                {v.total != null && <span className="font-semibold text-gray-900 dark:text-white">{usd(v.total)}</span>}
              </li>
            ))}
          </ul>
        )}
        {section === "files" && <EventFiles eventId={ev.id} role={ev.role} />}
        {section === "contracts" && ev.role === "client" && <ClientContractsList eventId={ev.id} />}
      </div>
    </div>
  );
}
