"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthService } from "@/service/auth/auth.service";
import { toast } from "react-toastify";
import Image from "next/image";
import { Camera, Loader2, Upload, X, BadgeCheck, Clock, ImagePlus } from "lucide-react";
import { shopUrl } from "@/components/marketplace/VendorShop";
import { SOCIALS, type SocialKey, type SocialLinksData } from "@/components/marketplace/SocialLinks";
import LocationField from "@/components/listing/LocationField";
import { phoneProblem } from "@/lib/booking-tracker";

/** Same rule as the server: 3–30 lower-case letters or numbers, single dashes between. */
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ProfileData {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  address?: string;
  bio?: string;
  handle?: string | null;
  banner_url?: string | null;
  logo_url?: string | null;
  socials?: SocialLinksData | null;
  phone_number?: string | null;
  business_address?: string | null;
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
  // shared with a customer only once their booking is accepted
  const [phone, setPhone] = useState("");
  // where customers come for packages done at the vendor's place (private until a booking is accepted)
  const [businessAddress, setBusinessAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseFiles, setLicenseFiles] = useState<File[]>([]);
  const [handle, setHandle] = useState("");
  const [savedHandle, setSavedHandle] = useState("");
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  // social accounts as typed; the server turns handles into links and says when one isn't right
  const [socials, setSocials] = useState<Record<SocialKey, string>>(() => Object.fromEntries(SOCIALS.map(({ key }) => [key, ""])) as Record<SocialKey, string>);

  const avatarRef = useRef<HTMLInputElement>(null);
  const licenseRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    AuthService.me()
      .then((res) => {
        const d: ProfileData = res.data?.data ?? res.data ?? {};
        setFirstName(d.first_name ?? "");
        setLastName(d.last_name ?? "");
        setBusinessName(d.vendorProfile?.business_name ?? "");
        setAboutMe(d.vendorProfile?.about_me ?? d.bio ?? "");
        setAddress(d.address ?? "");
        setPhone(d.phone_number ?? "");
        setBusinessAddress(d.business_address ?? "");
        setAvatarUrl(d.avatar_url ?? null);
        setLicenseStatus(d.vendorProfile?.license_status ?? "");
        setHandle(d.handle ?? "");
        setSavedHandle(d.handle ?? "");
        setBannerUrl(d.banner_url ?? null);
        setLogoUrl(d.logo_url ?? null);
        setSocials((cur) => Object.fromEntries(SOCIALS.map(({ key }) => [key, d.socials?.[key] ?? cur[key]])) as Record<SocialKey, string>);
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

  const pickImage = (file: File | undefined, set: (f: File) => void, preview: (url: string) => void) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Images can be up to 5 MB.");
    set(file);
    preview(URL.createObjectURL(file));
  };

  const cleanHandle = handle.trim().toLowerCase();
  const handleError =
    cleanHandle && (cleanHandle.length < 3 || cleanHandle.length > 30 || !HANDLE_RE.test(cleanHandle))
      ? "Use 3–30 lower-case letters or numbers, with single dashes between words."
      : "";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (handleError) return toast.error(handleError);
    const badPhone = phoneProblem(phone);
    if (badPhone) return toast.error(badPhone);
    setSaving(true);
    try {
      const fd = new FormData();
      if (firstName) fd.append("first_name", firstName);
      if (lastName) fd.append("last_name", lastName);
      if (businessName) fd.append("business_name", businessName);
      if (aboutMe) fd.append("about_me", aboutMe);
      if (address) fd.append("address", address);
      // always sent, so clearing them removes them
      fd.append("phone_number", phone.trim());
      fd.append("business_address", businessAddress.trim());
      if (avatarFile) fd.append("image", avatarFile);
      if (cleanHandle !== savedHandle) fd.append("handle", cleanHandle);
      if (bannerFile) fd.append("banner", bannerFile);
      if (logoFile) fd.append("logo", logoFile);
      // always sent, so clearing a field removes that link
      SOCIALS.forEach(({ key }) => fd.append(key, socials[key].trim()));

      const res = await AuthService.updateProfile(fd);
      if (res.data?.success) {
        toast.success("Profile saved successfully!");
        setAvatarFile(null);
        setBannerFile(null);
        setLogoFile(null);
        setSavedHandle(cleanHandle);
        // show the social links as saved (handles become full links)
        AuthService.me()
          .then((r) => {
            const saved: SocialLinksData | undefined = (r.data?.data ?? r.data)?.socials;
            if (saved) setSocials(Object.fromEntries(SOCIALS.map(({ key }) => [key, saved[key] ?? ""])) as Record<SocialKey, string>);
          })
          .catch(() => {});
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
              <label htmlFor="profile-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <LocationField value={{ label: address }} onChange={(p) => setAddress(p.label)} inputId="profile-address" placeholder="123 Main St, New York, NY" street />
            </div>

            <div>
              <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone number</label>
              <input
                id="profile-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 512 555 0134"
                maxLength={40}
                aria-describedby="profile-phone-hint"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <p id="profile-phone-hint" className="text-xs text-gray-400 mt-1">Only shared with a customer once you accept their booking, so you can call each other on the day.</p>
            </div>

            <div id="business-address">
              <label htmlFor="profile-business-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business address <span className="text-red-500">*</span></label>
              <LocationField value={{ label: businessAddress }} onChange={(p) => setBusinessAddress(p.label)} inputId="profile-business-address" label="Business address" street maxLength={500} />
              <p className="text-xs text-gray-400 mt-1">Required to publish. Private: customers see it only once you accept their booking. Delivery and travel miles are measured from it.</p>
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

          {/* Shop: link, banner and logo shown on the public shop page */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Shop</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Customers see these on your shop page. Share your link anywhere.
              </p>
            </div>

            <div>
              <label htmlFor="shop-handle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Shop link
              </label>
              <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-primary">
                <span className="pl-4 text-sm text-gray-400 whitespace-nowrap">vendlymarketplace.com/v/</span>
                <input
                  id="shop-handle"
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  placeholder="your-business"
                  maxLength={30}
                  autoCapitalize="none"
                  className="flex-1 min-w-0 px-1 py-2.5 bg-transparent focus:outline-none text-sm"
                />
              </div>
              {handleError ? (
                <p className="text-xs text-red-500 mt-1">{handleError}</p>
              ) : savedHandle ? (
                <a href={shopUrl(savedHandle)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                  View my shop
                </a>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Leave empty if you don&apos;t want a shop link yet.</p>
              )}
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banner</span>
              <button
                type="button"
                onClick={() => bannerRef.current?.click()}
                className="relative w-full aspect-[3/1] rounded-xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary transition flex items-center justify-center text-gray-400"
                aria-label={bannerUrl ? "Change banner" : "Add banner"}
              >
                {bannerUrl ? (
                  <Image src={bannerUrl} alt="Shop banner" fill className="object-cover" unoptimized />
                ) : (
                  <span className="flex items-center gap-2 text-sm">
                    <ImagePlus className="w-5 h-5" /> Add a wide banner (3:1)
                  </span>
                )}
              </button>
              <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], setBannerFile, setBannerUrl)} />
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary transition flex items-center justify-center text-gray-400 flex-shrink-0"
                aria-label={logoUrl ? "Change logo" : "Add logo"}
              >
                {logoUrl ? <Image src={logoUrl} alt="Shop logo" fill className="object-cover" unoptimized /> : <ImagePlus className="w-5 h-5" />}
              </button>
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Logo</span>
                <p className="text-xs text-gray-400 mt-1">Square image, JPEG, PNG or WebP, max 5MB</p>
              </div>
              <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], setLogoFile, setLogoUrl)} />
            </div>
          </div>

          {/* Social accounts: shown as links on the shop page */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Social accounts</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Add your @handle or paste a link. Customers can tap them on your shop page.
              </p>
            </div>
            {SOCIALS.map(({ key, label, placeholder, Icon }) => (
              <div key={key}>
                <label htmlFor={`social-${key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {label}
                </label>
                <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-primary">
                  <Icon className="ml-4 w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    id={`social-${key}`}
                    type="text"
                    inputMode="url"
                    value={socials[key]}
                    onChange={(e) => setSocials((cur) => ({ ...cur, [key]: e.target.value }))}
                    placeholder={placeholder}
                    maxLength={255}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="flex-1 min-w-0 px-3 py-2.5 bg-transparent focus:outline-none text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </form>

        {/* License Upload — separate section */}
        <div id="licence" className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 scroll-mt-24">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">License / Verification</h2>
          <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
            Upload your business license or certification documents for admin verification.
          </p>
          <p className="text-sm text-gray-600 mb-4 dark:text-gray-300 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
            No business license? Upload a screenshot of your business&apos;s social media page or website instead. To publish packages you need this approved and a verified photo ID (driver&apos;s license, passport or another government ID) from{" "}
            <Link href="/settings/verify-id" className="font-semibold text-primary underline">Verify your ID</Link>.
          </p>

          <button
            type="button"
            onClick={() => licenseRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-primary hover:text-primary transition text-sm dark:text-gray-400"
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
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
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
                className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center gap-2"
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
