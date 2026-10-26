"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, MapPin, Phone, User } from "lucide-react";
import { toast } from "react-toastify";
import { AuthService } from "@/service/auth/auth.service";
import { useOnboarding } from "@/providers/OnboardingProvider";
import { phoneProblem } from "@/lib/booking-tracker";

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white text-sm";

/** Name, profile photo and city: what vendors see when someone books them. The phone number only once they accept. */
export default function ProfileSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { refresh } = useOnboarding();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", address: "", phone_number: "" });
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    AuthService.me()
      .then((res) => {
        const u = res.data?.data;
        if (!u) return;
        setForm({ first_name: u.first_name ?? "", last_name: u.last_name ?? "", address: u.address ?? "", phone_number: u.phone_number ?? "" });
        setAvatar(u.avatar_url ?? null);
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  // the preview is a temporary object URL; release it when it changes
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setAvatar(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (!loaded) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose a photo (JPG, PNG or HEIC).");
    if (f.size > 5 * 1024 * 1024) return toast.error("That photo is over 5 MB. Choose a smaller one.");
    setPhoto(f);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) return toast.error("Add your first name.");
    const badPhone = phoneProblem(form.phone_number);
    if (badPhone) return toast.error(badPhone);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("first_name", form.first_name.trim());
      fd.append("last_name", form.last_name.trim());
      fd.append("name", `${form.first_name.trim()} ${form.last_name.trim()}`.trim());
      if (form.address.trim()) fd.append("address", form.address.trim());
      // always sent, so clearing it removes the number
      fd.append("phone_number", form.phone_number.trim());
      if (photo) fd.append("image", photo);
      const res = await AuthService.updateProfile(fd);
      if (res.data?.success === false) throw new Error(res.data?.message);
      setPhoto(null);
      toast.success("Profile saved");
      // ticks off the photo and city steps of the get-set-up checklist
      void refresh(true);
    } catch (err) {
      toast.error(apiMessage(err, "Couldn't save your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      id="profile"
      onSubmit={save}
      className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5 scroll-mt-24"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">What vendors see when you book them.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center group"
          aria-label={avatar ? "Change profile photo" : "Add a profile photo"}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-gray-400" />
          )}
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <Camera className="w-5 h-5 text-white" />
          </span>
        </button>
        <div className="text-sm">
          <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-primary hover:underline">
            {avatar ? "Change photo" : "Add a photo"}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">JPG, PNG or HEIC, up to 5 MB.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} data-testid="avatar-input" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          First name
          <input value={form.first_name} onChange={set("first_name")} autoComplete="given-name" maxLength={100} className={`${inputCls} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Last name
          <input value={form.last_name} onChange={set("last_name")} autoComplete="family-name" maxLength={100} className={`${inputCls} mt-1.5`} />
        </label>
      </div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        City
        <span className="relative block mt-1.5">
          <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={form.address} onChange={set("address")} placeholder="City, State" autoComplete="address-level2" maxLength={255} className={`${inputCls} pl-9`} />
        </span>
      </label>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Phone number
        <span className="relative block mt-1.5">
          <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="tel"
            inputMode="tel"
            value={form.phone_number}
            onChange={set("phone_number")}
            placeholder="+1 512 555 0134"
            autoComplete="tel"
            maxLength={40}
            className={`${inputCls} pl-9`}
          />
        </span>
        <span className="block mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
          Only shared with your vendor once they accept your booking, so you can call each other on the day.
        </span>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 inline-flex items-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save profile
      </button>
    </form>
  );
}
