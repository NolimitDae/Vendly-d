"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Link2,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Package,
  Camera,
  X,
  CalendarHeart,
  Clock,
} from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import { toast } from "react-toastify";
import BookingContractSection from "@/components/contracts/BookingContractSection";
import RentalReturnPanel, { type RentalBookingFields } from "@/components/rentals/RentalReturnPanel";
import BookingExtrasSection from "@/components/addons/BookingExtrasSection";
import VendorDisputeCard, { type DisputeFields } from "@/components/disputes/VendorDisputeCard";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import { closesIn } from "@/lib/requests";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-blush-100 text-plum-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
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

interface Booking extends DisputeFields {
  id: string;
  status: string;
  amount?: number;
  scheduled_at?: string;
  message?: string;
  created_at: string;
  /** an open request closes on its own at this time */
  request_expires_at?: string | null;
  listing?: { id: string; title: string; images: string[] };
  customer?: { id: string; name: string; avatar_url?: string; email: string };
  is_rental?: boolean;
  security_deposit?: number | string | null;
  rental_reservations?: RentalBookingFields["rental_reservations"];
  rental_return?: RentalBookingFields["rental_return"];
  event_bookings?: { event: { id: string; name: string; date?: string | null } }[];
  /** on a request: the vendor's confirmed bookings on the same day */
  same_day_bookings?: { id: string; title: string; status: string; start_at: string | null; end_at: string | null }[];
}

export default function VendorBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);

  // Proof upload state
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofNotes, setProofNotes] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Deliverable state
  const [delivTitle, setDelivTitle] = useState("");
  const [delivMsg, setDelivMsg] = useState("");
  const [delivLinks, setDelivLinks] = useState<string[]>([""]);
  const [delivFiles, setDelivFiles] = useState<File[]>([]);
  const [sendingDeliv, setSendingDeliv] = useState(false);
  const delivInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    try {
      const [bookingRes, proofsRes, delivRes] = await Promise.all([
        BookingService.getOne(id),
        BookingService.getProofs(id).catch(() => null),
        BookingService.getDeliverables(id).catch(() => null),
      ]);
      if (bookingRes.data?.success) setBooking(bookingRes.data.data);
      if (proofsRes?.data?.success) setProofs(proofsRes.data.data);
      if (delivRes?.data?.success) setDeliverables(delivRes.data.data);
    } catch {
      toast.error("Failed to load booking");
      router.push("/vendor/bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) fetchAll(); }, [id]);

  const handleUploadProof = async () => {
    if (!proofFiles.length) return toast.error("Select at least one photo");
    setUploadingProof(true);
    try {
      const res = await BookingService.uploadProof(id, proofFiles, proofNotes || undefined);
      if (res.data?.success) {
        toast.success("Proof uploaded");
        setProofFiles([]);
        setProofNotes("");
        fetchAll();
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSendDeliverable = async () => {
    if (!delivTitle.trim()) return toast.error("Title is required");
    setSendingDeliv(true);
    try {
      const validLinks = delivLinks.filter((l) => l.trim());
      const res = await BookingService.sendDeliverable(id, {
        title: delivTitle,
        message: delivMsg || undefined,
        links: validLinks,
        files: delivFiles,
      });
      if (res.data?.success) {
        toast.success("Deliverable sent");
        setDelivTitle("");
        setDelivMsg("");
        setDelivLinks([""]);
        setDelivFiles([]);
        fetchAll();
      }
    } catch {
      toast.error("Failed to send deliverable");
    } finally {
      setSendingDeliv(false);
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
      {/* Back */}
      <Link
        href="/vendor/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white dark:text-gray-400"
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
            <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">
              {booking.customer?.name} &middot; {booking.customer?.email}
            </p>
          </div>
          <span
            className={cn(
              "text-xs font-semibold px-2.5 py-1 rounded-full",
              STATUS_COLORS[booking.status] ?? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
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
              <p className="text-gray-400 text-xs">Amount</p>
              <p className="font-medium text-gray-800 dark:text-gray-200">
                ${Number(booking.amount).toFixed(2)}
              </p>
            </div>
          )}
          {booking.status === "PENDING" && closesIn(booking.request_expires_at) && (
            <div className="col-span-2 flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-amber-800 dark:text-amber-300">
              <Clock className="w-4 h-4 flex-shrink-0" aria-hidden />
              <p>
                {closesIn(booking.request_expires_at)}. Accept or decline before then, or the request closes automatically.
              </p>
            </div>
          )}
          {booking.status === "PENDING" && !!booking.same_day_bookings?.length && (
            <div role="note" className="col-span-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-medium">You already have {booking.same_day_bookings.length === 1 ? "a booking" : `${booking.same_day_bookings.length} bookings`} that day</p>
              <ul className="space-y-0.5">
                {booking.same_day_bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/vendor/bookings/${b.id}`} className="underline">
                      {b.title}
                    </Link>
                    {b.start_at ? ` · ${dayjs(b.start_at).format("h:mm A")}${b.end_at ? `–${dayjs(b.end_at).format("h:mm A")}` : ""}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-xs">Make sure you can do both before accepting.</p>
            </div>
          )}
          {booking.message && (
            <div className="col-span-2">
              <p className="text-gray-400 text-xs">Customer note</p>
              <p className="text-gray-700 dark:text-gray-300">{booking.message}</p>
            </div>
          )}
        </div>
      </div>

      {!!booking.event_bookings?.length && ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status) && (
        <Link href={`/my-events/${booking.event_bookings[0].event.id}`} className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-800 border border-primary/30 hover:shadow-md transition">
          <CalendarHeart className="w-5 h-5 text-primary" />
          <span className="flex-1">
            <span className="block font-semibold text-gray-900 dark:text-white">{booking.event_bookings[0].event.name}</span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">Run of show, shared files and the event chat</span>
          </span>
        </Link>
      )}

      <VendorDisputeCard bookingId={booking.id} booking={booking} onChanged={fetchAll} />

      <RentalReturnPanel booking={booking} role="VENDOR" onChanged={fetchAll} />

      <BookingContractSection bookingId={booking.id} role="VENDOR" bookingStatus={booking.status} onChanged={fetchAll} />

      {["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status) && (
        <BookingExtrasSection bookingId={booking.id} role="VENDOR" bookingStatus={booking.status} />
      )}

      {/* Photo Proof */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Photo Proof</h2>
        </div>

        {proofs.length > 0 && (
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

        <div className="space-y-2">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            ref={proofInputRef}
            onChange={(e) => setProofFiles(Array.from(e.target.files ?? []))}
          />
          <button
            onClick={() => proofInputRef.current?.click()}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary text-gray-500 hover:text-primary transition w-full justify-center dark:text-gray-400"
          >
            <Upload className="w-4 h-4" />
            {proofFiles.length ? `${proofFiles.length} photo(s) selected` : "Select photos"}
          </button>
          {proofFiles.length > 0 && (
            <>
              <textarea
                value={proofNotes}
                onChange={(e) => setProofNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <button
                onClick={handleUploadProof}
                disabled={uploadingProof}
                className="w-full py-2 gradient-bg text-white text-sm rounded-lg disabled:opacity-50"
              >
                {uploadingProof ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Upload Proof"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Deliverables */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Deliverables</h2>
        </div>

        {deliverables.length > 0 && (
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

        <div className="space-y-2">
          <input
            placeholder="Deliverable title *"
            value={delivTitle}
            onChange={(e) => setDelivTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            placeholder="Message (optional)"
            value={delivMsg}
            onChange={(e) => setDelivMsg(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />

          {/* Links */}
          <div className="space-y-1.5">
            {delivLinks.map((link, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={link}
                  onChange={(e) => {
                    const updated = [...delivLinks];
                    updated[i] = e.target.value;
                    setDelivLinks(updated);
                  }}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {delivLinks.length > 1 && (
                  <button
                    onClick={() => setDelivLinks(delivLinks.filter((_, j) => j !== i))}
                    className="p-2 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setDelivLinks([...delivLinks, ""])}
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> Add link
            </button>
          </div>

          {/* Files */}
          <input
            type="file"
            multiple
            className="hidden"
            ref={delivInputRef}
            onChange={(e) => setDelivFiles(Array.from(e.target.files ?? []))}
          />
          <button
            onClick={() => delivInputRef.current?.click()}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary text-gray-500 hover:text-primary transition w-full justify-center dark:text-gray-400"
          >
            <Upload className="w-4 h-4" />
            {delivFiles.length ? `${delivFiles.length} file(s) selected` : "Attach files (optional)"}
          </button>

          <button
            onClick={handleSendDeliverable}
            disabled={sendingDeliv || !delivTitle.trim()}
            className="w-full py-2 gradient-bg text-white text-sm rounded-lg disabled:opacity-50"
          >
            {sendingDeliv ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Send Deliverable"}
          </button>
        </div>
      </section>
    </div>
  );
}
