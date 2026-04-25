"use client";

import { useEffect, useRef, useState } from "react";
import { EventPlannerService } from "@/service/event-planner/event-planner.service";
import { toast } from "react-toastify";
import Image from "next/image";
import { Loader2, Upload, X, BadgeCheck, Clock } from "lucide-react";

const EVENT_TYPES = [
  "WEDDING",
  "BIRTHDAY",
  "CORPORATE",
  "CONCERT",
  "CONFERENCE",
  "PRIVATE_PARTY",
  "OTHER",
] as const;

interface ProfileData {
  business_name?: string;
  bio?: string;
  website?: string;
  instagram?: string;
  event_types?: string[];
  years_experience?: number;
  team_size?: number;
  portfolio?: string[];
  license_photo?: string[];
  license_status?: string;
}

export default function EventPlannerProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [licenseStatus, setLicenseStatus] = useState("");

  const [existingPortfolio, setExistingPortfolio] = useState<string[]>([]);
  const [newPortfolioFiles, setNewPortfolioFiles] = useState<File[]>([]);
  const [newLicenseFiles, setNewLicenseFiles] = useState<File[]>([]);

  const portfolioRef = useRef<HTMLInputElement>(null);
  const licenseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    EventPlannerService.getMyProfile()
      .then((res) => {
        if (res.data?.success) {
          const p: ProfileData = res.data.data;
          setBusinessName(p.business_name ?? "");
          setBio(p.bio ?? "");
          setWebsite(p.website ?? "");
          setInstagram(p.instagram ?? "");
          setEventTypes(p.event_types ?? []);
          setYearsExperience(String(p.years_experience ?? ""));
          setTeamSize(String(p.team_size ?? ""));
          setExistingPortfolio(p.portfolio ?? []);
          setLicenseStatus(p.license_status ?? "PENDING");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleEventType = (type: string) => {
    setEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      if (businessName) fd.append("business_name", businessName);
      if (bio) fd.append("bio", bio);
      if (website) fd.append("website", website);
      if (instagram) fd.append("instagram", instagram);
      eventTypes.forEach((t) => fd.append("event_types", t));
      if (yearsExperience) fd.append("years_experience", yearsExperience);
      if (teamSize) fd.append("team_size", teamSize);
      newPortfolioFiles.forEach((f) => fd.append("portfolio", f));
      newLicenseFiles.forEach((f) => fd.append("license", f));

      const res = await EventPlannerService.upsertProfile(fd);
      if (res.data?.success) {
        toast.success("Profile saved successfully!");
        setNewPortfolioFiles([]);
        setNewLicenseFiles([]);
        if (res.data.data?.portfolio) setExistingPortfolio(res.data.data.portfolio);
      } else {
        toast.error(res.data?.message || "Failed to save profile");
      }
    } catch {
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Planner Profile</h1>
          {licenseStatus && (
            <span
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                licenseStatus === "APPROVED"
                  ? "bg-green-100 text-green-700"
                  : licenseStatus === "SUSPENDED"
                    ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {licenseStatus === "APPROVED" ? (
                <BadgeCheck className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              {licenseStatus}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
            <h2 className="font-semibold text-gray-900 dark:text-white">Business Info</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Elite Events by Jane"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="Tell clients about your experience and style…"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Instagram
                </label>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Years of Experience
                </label>
                <input
                  type="number"
                  min="0"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Team Size
                </label>
                <input
                  type="number"
                  min="1"
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>
          </div>

          {/* Event Types */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Event Types</h2>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleEventType(type)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    eventTypes.includes(type)
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {type.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Portfolio */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Portfolio Photos</h2>

            {existingPortfolio.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
                {existingPortfolio.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <Image src={url} alt="" fill className="object-cover" />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => portfolioRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-primary hover:text-primary transition text-sm"
            >
              <Upload className="w-4 h-4" />
              {newPortfolioFiles.length > 0
                ? `${newPortfolioFiles.length} file(s) selected`
                : "Upload portfolio photos"}
            </button>
            <input
              ref={portfolioRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => setNewPortfolioFiles(Array.from(e.target.files ?? []))}
            />
            {newPortfolioFiles.length > 0 && (
              <p className="mt-2 text-xs text-amber-600">
                New photos will be added to your existing portfolio on save.
              </p>
            )}
          </div>

          {/* License */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">License / Certification</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload supporting documents for admin verification. Your profile becomes publicly
              visible once approved.
            </p>

            <button
              type="button"
              onClick={() => licenseRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-primary hover:text-primary transition text-sm"
            >
              <Upload className="w-4 h-4" />
              {newLicenseFiles.length > 0
                ? `${newLicenseFiles.length} file(s) selected`
                : "Upload license documents"}
            </button>
            <input
              ref={licenseRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              className="hidden"
              onChange={(e) => setNewLicenseFiles(Array.from(e.target.files ?? []))}
            />

            {newLicenseFiles.length > 0 && (
              <div className="mt-3 space-y-1">
                {newLicenseFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setNewLicenseFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
