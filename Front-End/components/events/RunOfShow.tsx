"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Clock, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { EventToolsService, type EventRole, type TimelineItem } from "@/service/events/eventTools.service";
import { errorMessage } from "@/service/rentals/rentals.service";

/** The day's schedule. Planner edits; a vendor ticks off their own items; the client reads. */
export default function RunOfShow({
  eventId,
  eventDate,
  role,
  userId,
  items,
  vendors,
  onChanged,
  readOnly = false,
}: {
  eventId: string;
  eventDate?: string | null;
  role: EventRole;
  userId?: string | null;
  items: TimelineItem[];
  vendors: { id: string; name: string }[];
  onChanged: () => void;
  /** A cancelled event: the schedule can be read but not changed. */
  readOnly?: boolean;
}) {
  const dayDefault = eventDate ? dayjs(eventDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(dayDefault);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const iso = (d: string, t: string) => new Date(`${d}T${t}`).toISOString();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !title.trim()) return toast.error("Add a start time and what happens");
    if (end && end < start) return toast.error("The end time must be after the start");
    setBusy("add");
    try {
      await EventToolsService.addTimeline(eventId, { starts_at: iso(day, start), ends_at: end ? iso(day, end) : undefined, title: title.trim(), notes: notes.trim() || undefined, location: location.trim() || undefined, vendor_id: vendorId || undefined });
      setStart(""); setEnd(""); setTitle(""); setNotes(""); setLocation(""); setVendorId("");
      setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add"));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (item: TimelineItem) => {
    setBusy(item.id);
    try {
      await EventToolsService.updateTimeline(eventId, item.id, { done: !item.done });
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: TimelineItem) => {
    if (!confirm(`Remove “${item.title}” from the run of show?`)) return;
    try {
      await EventToolsService.deleteTimeline(eventId, item.id);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove"));
    }
  };

  // group by day so multi-day events read naturally
  const days = items.reduce<Record<string, TimelineItem[]>>((acc, i) => {
    const k = dayjs(i.starts_at).format("YYYY-MM-DD");
    (acc[k] ??= []).push(i);
    return acc;
  }, {});

  const input = "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-5">
      {items.length === 0 && !adding && (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <Clock className="w-10 h-10 mx-auto text-primary mb-2" />
          <p className="font-semibold text-gray-900 dark:text-white">No run of show yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">
            {role === "planner" ? "Lay out the day: load-in, ceremony, dinner, first dance. Booked vendors see their parts." : "The planner hasn’t shared the schedule yet."}
          </p>
        </div>
      )}

      {Object.entries(days).map(([d, list]) => (
        <div key={d}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{dayjs(d).format("dddd D MMMM")}</p>
          <ol className="relative border-l-2 border-gray-100 dark:border-gray-700 ml-14 space-y-3">
            {list.map((item) => {
              const mine = role === "vendor" && item.vendor_id === userId;
              const canTick = !readOnly && (role === "planner" || mine);
              return (
                <li key={item.id} className="relative pl-5">
                  <span className="absolute -left-[4.6rem] top-3 w-14 text-right text-sm font-semibold text-gray-900 dark:text-white">
                    {dayjs(item.starts_at).format("HH:mm")}
                    {item.ends_at && <span className="block text-[11px] font-normal text-gray-400">{dayjs(item.ends_at).format("HH:mm")}</span>}
                  </span>
                  <span className={cn("absolute -left-[7px] top-4 w-3 h-3 rounded-full border-2", item.done ? "bg-green-500 border-green-500" : mine ? "bg-white dark:bg-gray-900 border-primary" : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600")} />
                  <div className={cn("rounded-xl p-3 bg-white dark:bg-gray-800 border", mine ? "border-primary/40" : "border-gray-100 dark:border-gray-700")}>
                    <div className="flex items-start gap-2">
                      <p className={cn("flex-1 font-medium text-gray-900 dark:text-white", item.done && "line-through text-gray-400")}>{item.title}</p>
                      {canTick && (
                        <button onClick={() => toggle(item)} aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} done`} className="text-gray-400 hover:text-green-600">
                          {busy === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : item.done ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5" />}
                        </button>
                      )}
                      {role === "planner" && !readOnly && (
                        <button onClick={() => remove(item)} aria-label={`Remove ${item.title}`} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                    {item.vendor && <p className="text-xs font-semibold text-primary mt-0.5">{mine ? "You" : item.vendor.name}</p>}
                    {item.location && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{item.location}</p>}
                    {item.notes && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line">{item.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {role === "planner" && !readOnly &&
        (adding ? (
          <form onSubmit={add} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs text-gray-500">Day<input type="date" className={input} value={day} onChange={(e) => setDay(e.target.value)} /></label>
              <label className="text-xs text-gray-500">Starts<input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label className="text-xs text-gray-500">Ends (optional)<input type="time" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
            <input className={input} placeholder="What happens, e.g. Ceremony" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
            <div className="grid sm:grid-cols-2 gap-3">
              <input className={input} placeholder="Where (optional)" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
              <select className={input} value={vendorId} onChange={(e) => setVendorId(e.target.value)} aria-label="Who runs it">
                <option value="">Who runs it (optional)</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <textarea className={input} rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
              <button type="submit" disabled={busy === "add"} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">{busy === "add" && <Loader2 className="w-4 h-4 animate-spin" />}Add</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/5">
            <Plus className="w-4 h-4" /> Add to the run of show
          </button>
        ))}
    </div>
  );
}
