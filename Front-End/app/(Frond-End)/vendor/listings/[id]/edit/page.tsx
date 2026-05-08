"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { toast } from "react-toastify";
import { Upload, X, Loader2, ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  sub_categories?: { id: string; name: string }[];
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Existing images from backend (full URLs)
  const [existingImages, setExistingImages] = useState<string[]>([]);
  // New files the user picks
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    price_unit: "fixed",
    location: "",
    availability: "",
    delivery_time: "",
    category_id: "",
    sub_category_id: "",
    tags: "",
  });

  useEffect(() => {
    Promise.all([
      MarketplaceService.getCategories(),
      VendorListingService.getOne(id),
    ]).then(([catRes, listingRes]) => {
      if (catRes.data?.success) setCategories(catRes.data.data);

      if (listingRes.data?.success) {
        const l = listingRes.data.data;
        setExistingImages(l.images ?? []);
        setForm({
          title: l.title ?? "",
          description: l.description ?? "",
          price: String(l.price ?? ""),
          price_unit: l.price_unit ?? "fixed",
          location: l.location ?? "",
          availability: l.availability ?? "",
          delivery_time: l.delivery_time ? String(l.delivery_time) : "",
          category_id: l.category?.id ?? "",
          sub_category_id: l.sub_category?.id ?? "",
          tags: Array.isArray(l.tags) ? l.tags.join(", ") : (l.tags ?? ""),
        });
      } else {
        toast.error("Listing not found");
        router.push("/vendor/listings");
      }
    }).catch(() => {
      toast.error("Failed to load listing");
      router.push("/vendor/listings");
    }).finally(() => setPageLoading(false));
  }, [id]);

  const selectedCategory = categories.find((c) => c.id === form.category_id);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const slots = 10 - existingImages.length - newImages.length;
    const picked = Array.from(files).slice(0, slots);
    setNewImages((prev) => [...prev, ...picked]);
    picked.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        setNewPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeExisting = (i: number) =>
    setExistingImages((prev) => prev.filter((_, idx) => idx !== i));

  const removeNew = (i: number) => {
    setNewImages((prev) => prev.filter((_, idx) => idx !== i));
    setNewPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.price) {
      toast.error("Title, description, and price are required");
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });

      // Only send images if the user picked new ones (replaces all old images on backend)
      if (newImages.length > 0) {
        newImages.forEach((img) => fd.append("images", img));
      }

      const res = await VendorListingService.update(id, fd);
      if (res.data?.success) {
        toast.success("Listing updated!");
        router.push("/vendor/listings");
      } else {
        toast.error(res.data?.message || "Failed to update listing");
      }
    } catch {
      toast.error("Failed to update listing");
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalImages = existingImages.length + newImages.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/vendor/listings"
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Edit Listing</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Images */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Photos</h2>
            {newImages.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                Uploading new photos will replace all current photos.
              </p>
            )}

            {/* Existing images */}
            {existingImages.length > 0 && newImages.length === 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {existingImages.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                    <Image src={src} alt="" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => removeExisting(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* New image previews */}
            {newImages.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {newPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                    <Image src={src} alt="" fill className="object-cover" />
                    <button
                      type="button"
                      onClick={() => removeNew(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {totalImages < 10 && (
              <div
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-primary transition"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <Upload className="w-7 h-7 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  {newImages.length > 0
                    ? "Add more photos"
                    : existingImages.length > 0
                    ? "Upload new photos to replace current ones"
                    : "Drop images here or click to upload"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {10 - totalImages} slot{10 - totalImages !== 1 ? "s" : ""} remaining
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
            )}
          </div>

          {/* Basic info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Basic Info</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={255}
                placeholder="e.g. Professional Wedding Photography"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                placeholder="Describe your service in detail..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Pricing</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="w-40">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Per</label>
                <select
                  value={form.price_unit}
                  onChange={(e) => set("price_unit", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-gray-900 dark:text-white"
                >
                  <option value="fixed">Fixed</option>
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="event">Event</option>
                  <option value="person">Person</option>
                </select>
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Category</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => {
                    set("category_id", e.target.value);
                    set("sub_category_id", "");
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-gray-900 dark:text-white"
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {selectedCategory?.sub_categories?.length ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Subcategory</label>
                  <select
                    value={form.sub_category_id}
                    onChange={(e) => set("sub_category_id", e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none text-gray-900 dark:text-white"
                  >
                    <option value="">Select subcategory</option>
                    {selectedCategory.sub_categories.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          {/* Details */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Additional Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="e.g. New York, NY"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Delivery Time (days)</label>
                <input
                  type="number"
                  value={form.delivery_time}
                  onChange={(e) => set("delivery_time", e.target.value)}
                  min="1"
                  placeholder="e.g. 3"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Availability</label>
              <textarea
                value={form.availability}
                onChange={(e) => set("availability", e.target.value)}
                rows={2}
                placeholder="e.g. Mon-Fri 9am-6pm, weekends available"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tags (comma separated)</label>
              <input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="e.g. photography, wedding, outdoor"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href="/vendor/listings"
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
