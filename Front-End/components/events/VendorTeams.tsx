"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Loader2, Plus, Search, Users, X } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { whoAmI } from "@/lib/currentUser";
import { isLoggedIn } from "@/lib/session";
import { useDebounce } from "@/hooks/useDebounce";
import { EventToolsService, MAX_TEAM_SIZE, type TeamVendor, type VendorTeam } from "@/service/events/eventTools.service";
import { errorMessage } from "@/service/rentals/rentals.service";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary";

function VendorAvatar({ vendor }: { vendor: TeamVendor }) {
  return vendor.avatar_url ? (
    <Image src={vendor.avatar_url} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" unoptimized />
  ) : (
    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary text-sm font-semibold flex items-center justify-center flex-shrink-0">
      {vendor.name[0]?.toUpperCase()}
    </div>
  );
}

/**
 * Create or edit a saved team: a name, the vendors in it, and a search to add any active vendor
 * (not only ones already booked).
 */
export function TeamEditorDialog({
  team,
  initialVendors = [],
  onClose,
  onSaved,
}: {
  /** the team to edit; without it a new team is made */
  team?: VendorTeam;
  /** vendors a new team starts with (e.g. the vendor whose profile it was made from) */
  initialVendors?: TeamVendor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [members, setMembers] = useState<TeamVendor[]>(team?.vendors ?? initialVendors);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamVendor[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const term = useDebounce(query.trim(), 300);

  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    setSearching(true);
    EventToolsService.searchTeamVendors(term)
      .then((r) => live && setResults(r.data?.data ?? []))
      .catch(() => live && setResults([]))
      .finally(() => live && setSearching(false));
    return () => {
      live = false;
    };
  }, [term]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const inTeam = new Set(members.map((m) => m.id));
  const full = members.length >= MAX_TEAM_SIZE;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.info("Give the team a name.");
    if (!members.length) return toast.info("Add at least one vendor.");
    setSaving(true);
    try {
      await EventToolsService.saveTeam({ name: name.trim(), vendor_ids: members.map((m) => m.id) }, team?.id);
      toast.success("Team saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the team"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-editor-title"
        onSubmit={save}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 z-10 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="team-editor-title" className="text-lg font-bold text-gray-900 dark:text-white">
            {team ? "Edit team" : "New team"}
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team name</label>
          <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="My wedding team" className={inputClass} />
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Vendors ({members.length}/{MAX_TEAM_SIZE})
          </p>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No vendors yet. Search below to add some.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <VendorAvatar vendor={m} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.name}</p>
                    {m.category && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.category}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMembers((list) => list.filter((x) => x.id !== m.id))}
                    aria-label={`Remove ${m.name}`}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
          <label htmlFor="team-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search vendors</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="team-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or category, e.g. catering"
              className={cn(inputClass, "pl-9")}
            />
          </div>
          {searching && <Loader2 className="w-4 h-4 animate-spin text-primary mt-3" aria-label="Searching" />}
          {!searching && term.length >= 2 && results.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No vendors match “{term}”.</p>
          )}
          {results.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="Search results">
              {results.map((v) => (
                <li key={v.id} className="flex items-center gap-3">
                  <VendorAvatar vendor={v} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{v.name}</p>
                    {v.category && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.category}</p>}
                  </div>
                  {inTeam.has(v.id) ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> In team</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMembers((list) => [...list, v])}
                      disabled={full}
                      aria-label={`Add ${v.name}`}
                      className="px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-xs font-medium hover:bg-primary/5 disabled:opacity-50"
                    >
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {full && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">A team can have up to {MAX_TEAM_SIZE} vendors.</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save team
          </button>
        </div>
      </form>
    </div>
  );
}

/** "Add to team" on a vendor's profile, for planners: into one of their saved teams, or a new one. */
export function AddToTeamButton({ vendor }: { vendor: TeamVendor }) {
  const [isPlanner, setIsPlanner] = useState(false);
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<VendorTeam[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    whoAmI().then((me) => setIsPlanner(me.type === "EVENT_PLANNER" && me.id !== vendor.id));
  }, [vendor.id]);

  const load = () => EventToolsService.teams().then((r) => setTeams(r.data?.data ?? [])).catch(() => setTeams([]));

  if (!isPlanner) return null;

  const toggle = () => {
    setOpen((o) => !o);
    if (!teams) load();
  };

  const addTo = async (t: VendorTeam) => {
    setAdding(t.id);
    try {
      // the team's current (still available) vendors plus this one
      await EventToolsService.saveTeam({ name: t.name, vendor_ids: [...t.vendors.map((v) => v.id), vendor.id] }, t.id);
      toast.success(`Added ${vendor.name} to ${t.name}`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not add to the team"));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="relative self-start sm:self-auto">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/5"
      >
        <Users className="w-4 h-4" />
        Add to team
      </button>
      {open && (
        <div role="dialog" aria-label="Add to a team" className="absolute right-0 mt-2 w-72 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2">
          {!teams ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="Loading teams" />
          ) : (
            <>
              {teams.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">You have no saved teams yet.</p>}
              <ul className="space-y-1">
                {teams.map((t) => {
                  const has = t.vendors.some((v) => v.id === vendor.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => addTo(t)}
                        disabled={has || adding !== null || t.vendors.length >= MAX_TEAM_SIZE}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:hover:bg-transparent disabled:opacity-70"
                      >
                        <span className="truncate">{t.name} ({t.vendors.length})</span>
                        {has ? <Check className="w-4 h-4 text-green-600" aria-label="Already in this team" /> : adding === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/5"
              >
                <Plus className="w-4 h-4" /> New team with {vendor.name}
              </button>
            </>
          )}
        </div>
      )}
      {creating && (
        <TeamEditorDialog
          initialVendors={[vendor]}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
