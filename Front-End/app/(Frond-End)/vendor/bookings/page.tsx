"use client";

import { useEffect, useState } from "react";
import { BookingService } from "@/service/booking/booking.service";
import Image from "next/image";
import { Calendar, Clock, Loader2, CheckCircle2, XCircle, Play } from "lucide-react";
import { toast } from "react-toastify";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CANCELLED: "bg-gray-100 text-gray-500",
  REJECTED: "bg-red-100 text-red-600",
};

interface Booking {
  id: string;
  status: string;
  created_at: string;
  scheduled_at?: string;
  amount?: number;
  message?: string;
  listing?: { id: string; title: string; images: string[] };
  customer?: { id: string; name: string; avatar_url?: string; email: string };
}

export default function VendorBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await BookingService.getMyAsVendor({
        page,
        status: statusFilter || undefined,
      });
      if (res.data?.success) {
        setBookings(res.data.data);
        setMeta(res.data.meta);
      }
    } catch {
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBookings(); }, [page, statusFilter]);

  const handleAction = async (
    action: "confirm" | "reject" | "start" | "complete" | "cancel",
    id: string,
  ) => {
    setActionLoading(id + action);
    try {
      let res: any;
      if (action === "confirm") res = await BookingService.confirm(id);
      else if (action === "reject") res = await BookingService.reject(id);
      else if (action === "start") res = await BookingService.startWork(id);
      else if (action === "complete") res = await BookingService.complete(id);
      else res = await BookingService.cancel(id);

      if (res.data?.success) {
        toast.success("Updated successfully");
        fetchBookings();
      } else {
        toast.error(res.data?.message || "Action failed");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Incoming Bookings</h1>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {["", "PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                statusFilter === s
                  ? "bg-primary text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>No bookings yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div key={booking.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    {booking.listing?.images?.[0] ? (
                      <Image src={booking.listing.images[0]} alt="" fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-2xl">🖼️</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                          {booking.listing?.title ?? "Service"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {booking.customer?.avatar_url ? (
                            <Image src={booking.customer.avatar_url} alt="" width={20} height={20} className="rounded-full object-cover" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold">
                              {booking.customer?.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm text-gray-500">{booking.customer?.name}</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[booking.status] ?? ""}`}>
                        {booking.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(booking.created_at).toLocaleDateString()}
                      </span>
                      {booking.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(booking.scheduled_at).toLocaleString()}
                        </span>
                      )}
                      {booking.amount && (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          ${Number(booking.amount).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {booking.message && (
                      <p className="mt-2 text-sm text-gray-500 italic">"{booking.message}"</p>
                    )}

                    {/* Action buttons based on status */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {booking.status === "PENDING" && (
                        <>
                          <ActionButton
                            label="Confirm"
                            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                            variant="success"
                            loading={actionLoading === booking.id + "confirm"}
                            onClick={() => handleAction("confirm", booking.id)}
                          />
                          <ActionButton
                            label="Reject"
                            icon={<XCircle className="w-3.5 h-3.5" />}
                            variant="danger"
                            loading={actionLoading === booking.id + "reject"}
                            onClick={() => handleAction("reject", booking.id)}
                          />
                        </>
                      )}
                      {booking.status === "CONFIRMED" && (
                        <ActionButton
                          label="Start Work"
                          icon={<Play className="w-3.5 h-3.5" />}
                          variant="primary"
                          loading={actionLoading === booking.id + "start"}
                          onClick={() => handleAction("start", booking.id)}
                        />
                      )}
                      {booking.status === "IN_PROGRESS" && (
                        <ActionButton
                          label="Mark Complete"
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          variant="success"
                          loading={actionLoading === booking.id + "complete"}
                          onClick={() => handleAction("complete", booking.id)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {meta.last_page > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: meta.last_page }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  page === i + 1 ? "bg-primary text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  variant,
  loading,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  variant: "success" | "danger" | "primary";
  loading: boolean;
  onClick: () => void;
}) {
  const styles = {
    success: "text-green-600 border-green-200 hover:bg-green-50",
    danger: "text-red-600 border-red-200 hover:bg-red-50",
    primary: "text-primary border-primary/30 hover:bg-primary/5",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition disabled:opacity-60 ${styles[variant]}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
