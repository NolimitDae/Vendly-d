"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Camera,
  Package,
  Link2,
  Upload,
} from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import { toast } from "react-toastify";
import BookingContractSection from "@/components/contracts/BookingContractSection";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REJECTED: "bg-red-100 text-red-600",
};

interface Proof {
  id: string;
  photos: string[];
  notes?: string;
  created_at: string;
  uploader: { id: string; name: string; avatar_url?: string };
}

interface Deliverable {
  id: string;
  title: string;
  message?: string;
  files: string[];
  links: string[];
  created_at: string;
}

interface Booking {
  id: string;
  status: string;
  amount?: number;
  service_fee?: number | string | null;
  paid_at?: string | null;
  scheduled_at?: string;
  message?: string;
  created_at: string;
  listing?: { id: string; title: string; images: string[] };
  vendor?: { id: string; name: string; avatar_url?: string };
}

export default function CustomerBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      BookingService.getOne(id),
      BookingService.getProofs(id).catch(() => null),
      BookingService.getDeliverables(id).catch(() => null),
    ])
      .then(([bookingRes, proofsRes, delivRes]) => {
        if (bookingRes.data?.success) setBooking(bookingRes.data.data);
        else { toast.error("Booking not found"); router.push("/bookings"); }
        if (proofsRes?.data?.success) setProofs(proofsRes.data.data ?? []);
        if (delivRes?.data?.success) setDeliverables(delivRes.data.data ?? []);
      })
      .catch(() => { toast.error("Failed to load booking"); router.push("/bookings"); })
      .finally(() => setLoading(false));
  }, [id]);

  const [paying, setPaying] = useState(false);
  const payNow = async () => {
    setPaying(true);
    try {
      const res = await BookingService.createCheckout(id);
      if (res.data?.data?.checkout_url) window.location.href = res.data.data.checkout_url;
      else setPaying(false);
    } catch {
      toast.error("Couldn't open payment");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </Link>

      {/* Booking summary */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {booking.listing?.title ?? "Booking"}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">by {booking.vendor?.name}</p>
          </div>
          <span
            className={cn(
              "text-xs font-semibold px-2.5 py-1 rounded-full",
              STATUS_COLORS[booking.status] ?? "bg-gray-100 text-gray-500",
            )}
          >
            {booking.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {booking.scheduled_at && (
            <div>
              <p className="text-gray-400 text-xs">Scheduled</p>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                {dayjs(booking.scheduled_at).format("MMM D, YYYY")}
              </p>
            </div>
          )}
          {booking.amount && (
            <div>
              <p className="text-gray-400 text-xs">Total</p>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                ${(Number(booking.amount) + Number(booking.service_fee ?? 0)).toFixed(2)}
              </p>
              {Number(booking.service_fee ?? 0) > 0 && (
                <p className="text-xs text-gray-400">
                  ${Number(booking.amount).toFixed(2)} + ${Number(booking.service_fee).toFixed(2)} Vendly service fee
                </p>
              )}
            </div>
          )}
          {booking.message && (
            <div className="col-span-2">
              <p className="text-gray-400 text-xs">Your note</p>
              <p className="text-gray-700 dark:text-gray-300">{booking.message}</p>
            </div>
          )}
        </div>
      </div>

      {["CONFIRMED", "IN_PROGRESS"].includes(booking.status) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
          {booking.paid_at ? (
            <p className="text-sm text-green-700">Paid on {dayjs(booking.paid_at).format("MMM D, YYYY")}</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">The vendor signed. Pay to secure your booking.</p>
              <button
                onClick={payNow}
                disabled={paying}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
              >
                {paying ? "Opening…" : "Pay now"}
              </button>
            </>
          )}
        </div>
      )}

      <BookingContractSection bookingId={booking.id} role="CUSTOMER" bookingStatus={booking.status} />

      {/* Photo Proof */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Photo Proof</h2>
        </div>

        {proofs.length === 0 ? (
          <p className="text-sm text-gray-400">No proof uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {proofs.map((proof) => (
              <div key={proof.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-400">{dayjs(proof.created_at).format("MMM D, YYYY h:mm A")}</p>
                {proof.notes && <p className="text-sm text-gray-600 dark:text-gray-300">{proof.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {proof.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={url}
                        alt={`Proof ${i + 1}`}
                        width={80}
                        height={80}
                        className="w-20 h-20 object-cover rounded-lg border"
                        unoptimized
                      />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Deliverables */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Deliverables</h2>
        </div>

        {deliverables.length === 0 ? (
          <p className="text-sm text-gray-400">No deliverables sent yet.</p>
        ) : (
          <div className="space-y-3">
            {deliverables.map((d) => (
              <div key={d.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <p className="font-medium text-gray-900 dark:text-white">{d.title}</p>
                <p className="text-xs text-gray-400">{dayjs(d.created_at).format("MMM D, YYYY h:mm A")}</p>
                {d.message && <p className="text-sm text-gray-600 dark:text-gray-300">{d.message}</p>}
                {d.files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {d.files.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" /> File {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                {d.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {d.links.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 underline flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" /> {link}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
