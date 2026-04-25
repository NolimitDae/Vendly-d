"use client";

import { useEffect, useRef, useState } from "react";
import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";
import Image from "next/image";
import { Camera, Loader2, Upload, X, BadgeCheck, Clock } from "lucide-react";

interface ProfileData {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  address?: string;
  bio?: string;
  vendorProfile?: {
    business_name?: string;
    about_me?: string;
    license_status?: string;
    license_photo?: string[];
  };
}

export default function VendorProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseFiles, setLicenseFiles] = useState<File[]>([]);

  const avatarRef = useRef<HTMLInputElement>(null);
  const licenseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    AuthService.me()
      .then((res) => {
        const d: ProfileData = res.data?.data ?? res.data ?? {};
        setFirstName(d.first_name ?? "");
        setLastName(d.last_name ?? "");
        setBusinessName(d.vendorProfile?.business_name ?? "");
        setAboutMe(d.vendorProfile?.about_me ?? d.bio ?? "");
        setAddress(d.address ?? "");
        setAvatarUrl(d.avatar_url ?? null);
        setLicenseStatus(d.vendorProfile?.license_status ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      if (firstName) fd.append("first_name", firstName);
      if (lastName) fd.append("last_name", lastName);
      if (businessName) fd.append("business_name", businessName);
      if (aboutMe) fd.append("about_me", aboutMe);
      if (address) fd.append("address", address);
      if (avatarFile) fd.append("image", avatarFile);

      const res = await AuthService.updateProfile(fd);
      if (res.data?.success) {
        toast.success("Profile saved successfully!");
        setAvatarFile(null);
      } else {
        toast.error(res.data?.message || "Failed to save profile");
      }
    } catch {
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLicenseUpload = async () => {
    if (licenseFiles.length === 0) return;
    setUploadingLicense(true);
    try {
      const fd = new FormData();
      licenseFiles.forEach((f) => fd.append("license", f));
      const res = await AuthService.addLicense(fd);
      if (res.data?.success) {
        toast.success("License documents uploaded!");
        setLicenseFiles([]);
        setLicenseStatus("PENDING");
      } else {
        toast.error(res.data?.message || "Upload failed");
      }
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploadingLicense(false);
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
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

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Profile Photo</h2>
            <div className="flex items-center gap-5">
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="avatar" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-3xl text-gray-400">
                    {firstName?.[0] ?? "?"}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity rounded-full"
                >
                  <Camera className="w-6 h-6 text-white" />
                </button>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Change photo
                </button>
                <p className="text-xs text-gray-400 mt-1">JPEG or PNG, max 5MB</p>
              </div>
            </div>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Personal Info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
            <h2 className="font-semibold text-gray-900 dark:text-white">Personal Info</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, New York, NY"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>

          {/* Business Info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
            <h2 className="font-semibold text-gray-900 dark:text-white">Business Info</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Jane's Photography Studio"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">About</label>
              <textarea
                value={aboutMe}
                onChange={(e) => setAboutMe(e.target.value)}
                rows={4}
                placeholder="Tell clients about your services and experience…"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
              />
            </div>
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

        {/* License Upload — separate section */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">License / Verification</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload your business license or certification documents for admin verification.
          </p>

          <button
            type="button"
            onClick={() => licenseRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-primary hover:text-primary transition text-sm"
          >
            <Upload className="w-4 h-4" />
            {licenseFiles.length > 0 ? `${licenseFiles.length} file(s) selected` : "Upload documents"}
          </button>
          <input
            ref={licenseRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => setLicenseFiles(Array.from(e.target.files ?? []))}
          />

          {licenseFiles.length > 0 && (
            <div className="mt-3 space-y-1">
              {licenseFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="flex-1 truncate">{f.name}</span>
                  <button type="button" onClick={() => setLicenseFiles((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleLicenseUpload}
                disabled={uploadingLicense}
                className="mt-3 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center gap-2"
              >
                {uploadingLicense && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Upload
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
