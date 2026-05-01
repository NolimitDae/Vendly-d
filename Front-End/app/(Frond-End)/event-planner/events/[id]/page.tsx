"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  CheckSquare,
  Square,
  Plus,
  Loader2,
  Trash2,
  AlertTriangle,
  Edit2,
} from "lucide-react";
import dayjs from "dayjs";
import { EventsService } from "@/service/events/events.service";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventTask {
  id: string;
  title: string;
  due_date?: string;
  completed: boolean;
}

interface BudgetItem {
  id: string;
  category: string;
  allocated_amount: number;
  spent_amount: number;
  note?: string;
}

interface EventBooking {
  id: string;
  booking: {
    id: string;
    vendor: { id: string; name: string; avatar?: string };
    listing: { id: string; title: string; price: number; images: string[] };
  };
}

interface Event {
  id: string;
  name: string;
  type?: string;
  date?: string;
  venue?: string;
  guest_count?: number;
  total_budget?: number;
  notes?: string;
  status: string;
  bookings: EventBooking[];
  budget_items: BudgetItem[];
  tasks: EventTask[];
  created_at: string;
}

interface BudgetSummary {
  items: BudgetItem[];
  total_allocated: number;
  total_spent: number;
  remaining: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "vendors" | "budget" | "tasks";

const STATUS_STYLES: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  CANCELLED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_LABEL: Record<string, string> = {
  WEDDING: "Wedding",
  BIRTHDAY: "Birthday",
  CORPORATE: "Corporate",
  CONCERT: "Concert",
  CONFERENCE: "Conference",
  PRIVATE_PARTY: "Private Party",
  OTHER: "Other",
};

const inputClass =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm";

// ── Page ───────────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<Event | null>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [cancelling, setCancelling] = useState(false);

  // Task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [togglingTask, setTogglingTask] = useState<string | null>(null);

  // Budget form
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetAllocated, setBudgetAllocated] = useState("");
  const [budgetNote, setBudgetNote] = useState("");
  const [addingBudget, setAddingBudget] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([EventsService.getOne(id), EventsService.getBudget(id)])
      .then(([evRes, budRes]) => {
        if (evRes.data?.success) setEvent(evRes.data.data);
        if (budRes.data?.success) setBudget(budRes.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!confirm("Cancel this event? This action cannot be undone.")) return;
    setCancelling(true);
    try {
      const res = await EventsService.cancel(id);
      if (res.data?.success) {
        toast.success("Event cancelled");
        router.push("/event-planner/events");
      } else {
        toast.error(res.data?.message || "Failed to cancel event");
      }
    } catch {
      toast.error("Failed to cancel event");
    } finally {
      setCancelling(false);
    }
  };

  const handleToggleTask = async (task: EventTask) => {
    setTogglingTask(task.id);
    const updated = { completed: !task.completed };
    setEvent((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, ...updated } : t)),
          }
        : prev,
    );
    try {
      await EventsService.updateTask(id, task.id, updated);
    } catch {
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.id === task.id ? { ...t, completed: task.completed } : t,
              ),
            }
          : prev,
      );
      toast.error("Failed to update task");
    } finally {
      setTogglingTask(null);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setAddingTask(true);
    try {
      const res = await EventsService.createTask(id, {
        title: taskTitle.trim(),
        due_date: taskDue || undefined,
      });
      if (res.data?.success) {
        setEvent((prev) =>
          prev ? { ...prev, tasks: [...prev.tasks, res.data.data] } : prev,
        );
        setTaskTitle("");
        setTaskDue("");
        toast.success("Task added");
      } else {
        toast.error(res.data?.message || "Failed to add task");
      }
    } catch {
      toast.error("Failed to add task");
    } finally {
      setAddingTask(false);
    }
  };

  const handleAddBudgetItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetCategory.trim() || !budgetAllocated) return;
    setAddingBudget(true);
    try {
      const res = await EventsService.addBudgetItem(id, {
        category: budgetCategory.trim(),
        allocated: Number(budgetAllocated),
        note: budgetNote || undefined,
      });
      if (res.data?.success) {
        const newItem = res.data.data as BudgetItem;
        setEvent((prev) =>
          prev ? { ...prev, budget_items: [...prev.budget_items, newItem] } : prev,
        );
        setBudget((prev) =>
          prev
            ? {
                ...prev,
                items: [...prev.items, newItem],
                total_allocated: prev.total_allocated + newItem.allocated_amount,
                remaining: prev.remaining - newItem.allocated_amount,
              }
            : prev,
        );
        setBudgetCategory("");
        setBudgetAllocated("");
        setBudgetNote("");
        toast.success("Budget item added");
      } else {
        toast.error(res.data?.message || "Failed to add budget item");
      }
    } catch {
      toast.error("Failed to add budget item");
    } finally {
      setAddingBudget(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-400 gap-3">
        <p className="text-lg font-medium">Event not found</p>
        <Link href="/event-planner/events" className="text-primary hover:underline text-sm">
          Back to events
        </Link>
      </div>
    );
  }

  const completedTasks = event.tasks.filter((t) => t.completed).length;
  const totalTasks = event.tasks.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="py-10 sm:py-16 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Back */}
        <Link
          href="/event-planner/events"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Events
        </Link>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{event.name}</h1>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-2.5 py-1 rounded-full",
                      STATUS_STYLES[event.status] ?? "bg-gray-100 text-gray-500",
                    )}
                  >
                    {event.status.replace("_", " ")}
                  </span>
                </div>
                {event.type && (
                  <p className="text-sm text-gray-400 mt-0.5">{TYPE_LABEL[event.type] ?? event.type}</p>
                )}
              </div>
            </div>

            {event.status !== "CANCELLED" && event.status !== "COMPLETED" && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-60"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                Cancel Event
              </button>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-5 mt-5 text-sm text-gray-500 dark:text-gray-400">
            {event.date && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                {dayjs(event.date).format("MMM D, YYYY [at] h:mm A")}
              </div>
            )}
            {event.venue && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                {event.venue}
              </div>
            )}
            {event.guest_count && (
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                {event.guest_count} guests
              </div>
            )}
            {event.total_budget && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-gray-400" />
                ${Number(event.total_budget).toLocaleString()} total budget
              </div>
            )}
          </div>

          {/* Task progress bar */}
          {totalTasks > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Tasks</span>
                <span>
                  {completedTasks}/{totalTasks} done
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-1.5 shadow-sm">
          {(["overview", "vendors", "budget", "tasks"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-medium capitalize transition",
                tab === t
                  ? "bg-primary text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700",
              )}
            >
              {t}
              {t === "vendors" && ` (${event.bookings.length})`}
              {t === "tasks" && ` (${completedTasks}/${totalTasks})`}
              {t === "budget" && budget && ` (${event.budget_items.length})`}
            </button>
          ))}
        </div>

        {/* ── TAB: Overview ── */}
        {tab === "overview" && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Event Details
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  { label: "Event Name", value: event.name },
                  { label: "Type", value: event.type ? (TYPE_LABEL[event.type] ?? event.type) : "—" },
                  {
                    label: "Date",
                    value: event.date ? dayjs(event.date).format("MMMM D, YYYY [at] h:mm A") : "—",
                  },
                  { label: "Venue", value: event.venue || "—" },
                  { label: "Guest Count", value: event.guest_count?.toLocaleString() || "—" },
                  {
                    label: "Total Budget",
                    value: event.total_budget
                      ? `$${Number(event.total_budget).toLocaleString()}`
                      : "—",
                  },
                  { label: "Status", value: event.status.replace("_", " ") },
                  {
                    label: "Created",
                    value: dayjs(event.created_at).format("MMM D, YYYY"),
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                    <dt className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {event.notes && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Notes
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  {event.notes}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              <Link
                href="/marketplace"
                className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition font-medium"
              >
                <Plus className="w-4 h-4" />
                Add a vendor from marketplace
              </Link>
            </div>
          </div>
        )}

        {/* ── TAB: Vendors ── */}
        {tab === "vendors" && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            {event.bookings.length === 0 ? (
              <div className="py-16 text-center">
                <DollarSign className="w-9 h-9 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400">No vendors linked yet</p>
                <Link
                  href="/marketplace"
                  className="mt-4 inline-block text-sm text-primary hover:underline"
                >
                  Browse marketplace to add vendors
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {event.bookings.map((eb) => {
                  const { booking } = eb;
                  const cover = booking.listing.images?.[0];
                  return (
                    <li key={eb.id} className="flex items-center gap-4 p-4">
                      {/* Listing thumbnail */}
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0 relative">
                        {cover ? (
                          <Image src={cover} alt={booking.listing.title} fill className="object-cover" unoptimized />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-xl">🖼️</div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {booking.listing.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {booking.vendor.avatar ? (
                            <Image
                              src={booking.vendor.avatar}
                              alt={booking.vendor.name}
                              width={16}
                              height={16}
                              className="rounded-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] text-primary font-medium flex-shrink-0">
                              {booking.vendor.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="text-xs text-gray-400">{booking.vendor.name}</span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-sm text-primary">
                          ${Number(booking.listing.price).toLocaleString()}
                        </p>
                        <Link
                          href={`/bookings/${booking.id}`}
                          className="text-xs text-gray-400 hover:text-primary transition"
                        >
                          View booking
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
              <Link
                href="/marketplace"
                className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition font-medium"
              >
                <Plus className="w-4 h-4" />
                Add vendor from marketplace
              </Link>
            </div>
          </div>
        )}

        {/* ── TAB: Budget ── */}
        {tab === "budget" && (
          <div className="space-y-4">
            {/* Summary */}
            {budget && (
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: "Allocated",
                    value: budget.total_allocated,
                    color: "text-blue-600 dark:text-blue-400",
                    bg: "bg-blue-50 dark:bg-blue-900/20",
                  },
                  {
                    label: "Spent",
                    value: budget.total_spent,
                    color: "text-red-600 dark:text-red-400",
                    bg: "bg-red-50 dark:bg-red-900/20",
                  },
                  {
                    label: "Remaining",
                    value: budget.remaining,
                    color: "text-green-600 dark:text-green-400",
                    bg: "bg-green-50 dark:bg-green-900/20",
                  },
                ].map(({ label, value, color, bg }) => (
                  <div
                    key={label}
                    className={cn(
                      "rounded-2xl p-4 text-center border border-gray-100 dark:border-gray-700",
                      bg,
                    )}
                  >
                    <p className={cn("text-xl font-bold", color)}>
                      ${Number(value).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Items list */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              {event.budget_items.length === 0 ? (
                <div className="py-12 text-center">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">No budget items yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Category
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Allocated
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Spent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {event.budget_items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{item.category}</p>
                          {item.note && (
                            <p className="text-xs text-gray-400 mt-0.5">{item.note}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                          ${Number(item.allocated_amount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              "font-medium",
                              item.spent_amount > item.allocated_amount
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-700 dark:text-gray-300",
                            )}
                          >
                            ${Number(item.spent_amount).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add budget item form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Add Budget Item
              </h3>
              <form onSubmit={handleAddBudgetItem} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={budgetCategory}
                    onChange={(e) => setBudgetCategory(e.target.value)}
                    placeholder="Category (e.g. Catering)"
                    className={inputClass}
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={budgetAllocated}
                    onChange={(e) => setBudgetAllocated(e.target.value)}
                    placeholder="Allocated ($)"
                    className={inputClass}
                    required
                  />
                </div>
                <input
                  value={budgetNote}
                  onChange={(e) => setBudgetNote(e.target.value)}
                  placeholder="Note (optional)"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={addingBudget || !budgetCategory.trim() || !budgetAllocated}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
                >
                  {addingBudget ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Item
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB: Tasks ── */}
        {tab === "tasks" && (
          <div className="space-y-4">
            {/* Task list */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              {event.tasks.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckSquare className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">No tasks yet — add one below</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {event.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition"
                    >
                      <button
                        onClick={() => handleToggleTask(task)}
                        disabled={togglingTask === task.id}
                        className={cn(
                          "flex-shrink-0 transition",
                          task.completed ? "text-primary" : "text-gray-300 dark:text-gray-600",
                        )}
                        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {togglingTask === task.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : task.completed ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm text-gray-900 dark:text-white",
                            task.completed && "line-through text-gray-400 dark:text-gray-500",
                          )}
                        >
                          {task.title}
                        </p>
                        {task.due_date && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Due {dayjs(task.due_date).format("MMM D, YYYY")}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add task form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Add Task
              </h3>
              <form onSubmit={handleAddTask} className="space-y-3">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className={inputClass}
                  required
                />
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className={cn(inputClass, "flex-1")}
                  />
                  <button
                    type="submit"
                    disabled={addingTask || !taskTitle.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    {addingTask ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Add
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
