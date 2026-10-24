"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Users } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { EventToolsService, usd, type BudgetSummary, type VendorTeam } from "@/service/events/eventTools.service";
import { errorMessage } from "@/service/rentals/rentals.service";
import { TeamEditorDialog } from "./VendorTeams";

/** Budget from real bookings: committed (accepted), paid and what's left. */
export function BookingsBudget({ eventId, refreshKey }: { eventId: string; refreshKey?: unknown }) {
  const [b, setB] = useState<BudgetSummary | null>(null);
  useEffect(() => {
    EventToolsService.budget(eventId).then((r) => setB(r.data?.data ?? null)).catch(() => setB(null));
  }, [eventId, refreshKey]);
  if (!b) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  const pct = b.total_budget ? Math.min(100, (b.committed / b.total_budget) * 100) : 0;
  const booked = b.lines.filter((l) => l.booking);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[["Budget", b.total_budget], ["Committed", b.committed], ["Paid", b.spent]].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{usd(value as number | null)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>
      {b.total_budget != null && (
        <div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className={cn("h-full rounded-full", b.over_budget ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <p className={cn("text-xs mt-1", b.over_budget ? "text-red-500" : "text-gray-500 dark:text-gray-400")}>
            {b.over_budget ? `${usd(-(b.remaining ?? 0))} over budget` : `${usd(b.remaining)} left to commit`}
          </p>
        </div>
      )}
      {booked.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">From bookings</p>
          <ul className="space-y-2">
            {booked.map((l) => (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{l.booking!.vendor_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{l.category} · {l.booking!.title}</p>
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">{usd(l.spent)} <span className="text-gray-400 font-normal">/ {usd(l.committed)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Share the event read-only with the planner's client. */
export function ClientShareCard({ eventId, email, seesBudget, onChanged }: { eventId: string; email?: string | null; seesBudget?: boolean; onChanged: () => void }) {
  const [value, setValue] = useState(email ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(email ?? ""), [email]);
  const save = async (body: { email?: string | null; sees_budget?: boolean }) => {
    setBusy(true);
    try {
      await EventToolsService.setClient(eventId, body);
      if (body.email) toast.success(`Shared. We emailed ${body.email} a link.`);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Could not share"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> Share with your client</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">Your client follows along read-only: vendors, run of show and shared files. They sign in with this email.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) save({ email: value.trim() }); }} className="flex gap-2">
        <input type="email" value={value} onChange={(e) => setValue(e.target.value)} placeholder="client@email.com" aria-label="Client email" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">{email && value.trim().toLowerCase() === email ? "Shared ✓" : "Share"}</button>
        {email && <button type="button" onClick={() => save({ email: null })} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Stop sharing</button>}
      </form>
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={!!seesBudget} onChange={(e) => save({ sees_budget: e.target.checked })} className="accent-primary" />
        Show prices and budget to the client
      </label>
    </div>
  );
}

/** Saved vendor teams: save booked vendors as a team, invite a whole team to this event. */
export function TeamsCard({
  eventId,
  bookedVendors,
  readOnly = false,
}: {
  eventId: string;
  bookedVendors: { id: string; name: string }[];
  /** a cancelled event: teams can be managed, but nobody can be invited to it */
  readOnly?: boolean;
}) {
  const [teams, setTeams] = useState<VendorTeam[] | null>(null);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // the team open in the editor ("new" for a new one)
  const [editing, setEditing] = useState<VendorTeam | "new" | null>(null);
  const load = useCallback(() => {
    EventToolsService.teams().then((r) => setTeams(r.data?.data ?? [])).catch(() => setTeams([]));
  }, []);
  useEffect(load, [load]);

  const saveBooked = async () => {
    const name = prompt("Name this team", "My dream team");
    if (!name?.trim()) return;
    try {
      await EventToolsService.saveTeam({ name: name.trim(), vendor_ids: bookedVendors.map((v) => v.id) });
      toast.success("Team saved");
      load();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"));
    }
  };

  const remove = async (t: VendorTeam) => {
    if (!confirm(`Delete the team “${t.name}”?`)) return;
    await EventToolsService.deleteTeam(t.id).catch(() => null);
    if (selected === t.id) setSelected("");
    load();
  };

  const invite = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await EventToolsService.inviteTeam(eventId, selected, note.trim() || undefined);
      toast.success(`Invited ${r.data?.data?.invited ?? 0} vendors. Replies and quotes show up in Messages.`);
      setNote("");
      setSelected("");
    } catch (e) {
      toast.error(errorMessage(e, "Could not invite"));
    } finally {
      setBusy(false);
    }
  };

  const team = teams?.find((t) => t.id === selected);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Vendor teams</h3>
      {!teams ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Save the vendors you love working with (booked before or not), then invite them all to your next event in one go.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <span key={t.id} className={cn("inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full border text-sm", selected === t.id ? "bg-primary text-primary-foreground border-primary" : "border-gray-200 dark:border-gray-700")}>
                <button onClick={() => setSelected(selected === t.id ? "" : t.id)}>{t.name} ({t.vendors.length})</button>
                <button onClick={() => remove(t)} aria-label={`Delete ${t.name}`} className="px-1.5 opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
          {team && (
            <button onClick={() => setEditing(team)} className="text-sm text-primary hover:underline">
              Edit {team.name}
            </button>
          )}
          {team && readOnly && <p className="text-xs text-gray-500 dark:text-gray-400">This event was cancelled, so you can&apos;t invite a team to it.</p>}
          {team && !readOnly && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{team.vendors.map((v) => v.name).join(", ")}</p>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Invite note" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button onClick={invite} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Invite this team</button>
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button onClick={() => setEditing("new")} className="text-sm text-primary hover:underline">New team</button>
        {bookedVendors.length > 1 && (
          <button onClick={saveBooked} className="text-sm text-primary hover:underline">Save these {bookedVendors.length} booked vendors as a team</button>
        )}
      </div>
      {editing && (
        <TeamEditorDialog team={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
