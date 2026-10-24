"use client";

import TrashIcon from "@/icons/TrashIcon";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";
import { FileInput, GenericInput } from "../../Input";
import GenericButton from "../GenericButton";
import { AuthService } from "@/service/auth/auth.service";

export interface SavedProfile {
  name: string;
  email: string;
  avatar_url?: string;
}

const MAX_PHOTO_MB = 5; // PATCH /auth/update refuses larger pictures

/** The admin's own name and photo, saved with PATCH /auth/update (the same endpoint the website profile uses). */
const ProfileContent = ({ onSaved }: { onSaved?: (profile: SavedProfile) => void }) => {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    AuthService.me()
      .then((res) => {
        const u = res.data?.data;
        if (!u) return;
        // older accounts only have a full name
        const [first = "", ...rest] = (u.name ?? "").split(" ");
        setForm({ first_name: u.first_name ?? first, last_name: u.last_name ?? rest.join(" ") });
        setEmail(u.email ?? "");
        setAvatar(u.avatar_url ?? null);
      })
      .catch(() => toast.error("Couldn't load your profile"))
      .finally(() => setLoaded(true));
  }, []);

  // the preview is a temporary object URL; release it when it changes
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return void toast.error("Choose a photo (JPG, PNG, WebP or GIF).");
    if (f.size > MAX_PHOTO_MB * 1024 * 1024) return void toast.error(`That photo is over ${MAX_PHOTO_MB} MB. Choose a smaller one.`);
    setPhoto(f);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    if (!first) return void toast.error("Add your first name.");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("first_name", first);
      if (last) fd.append("last_name", last);
      fd.append("name", `${first} ${last}`.trim());
      if (photo) fd.append("image", photo);
      const res = await AuthService.updateProfile(fd);
      if (res.data?.success === false) throw new Error(res.data?.message);
      // read it back for the new photo link
      const me = await AuthService.me().catch(() => null);
      const u = me?.data?.data;
      if (u?.avatar_url) setAvatar(u.avatar_url);
      setPhoto(null);
      toast.success("Profile saved");
      onSaved?.({ name: u?.name ?? `${first} ${last}`.trim(), email: u?.email ?? email, avatar_url: u?.avatar_url ?? avatar ?? undefined });
    } catch (err: any) {
      const m = err?.response?.data?.message ?? err?.message;
      toast.error((Array.isArray(m) ? m[0] : m) || "Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const shown = preview ?? avatar;

  return (
    <div className="flex flex-col mt-6 lg:mt-8">
      {/* Top Section */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Section */}
        <div className="space-y-1 lg:max-w-[260px]">
          <h2 className="text-blackColor text-base font-medium leading-[160%]">
            Personal Information
          </h2>
          <p className="text-descriptionColor text-sm leading-[160%]">
            Manage your basic details for identification and communication.
          </p>
        </div>

        {/* Right Section */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm text-blackColor font-medium leading-[160%]">
            Profile picture
          </h2>

          {/* Image + Upload */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            {/* Image */}
            <div className=" relative shrink-0 mx-auto sm:mx-0 w-20 h-20">
              <Image
                src={shown || "/profile.png"}
                alt="Profile picture"
                width={100}
                height={100}
                className="w-20 h-20  rounded-full object-cover"
                unoptimized
              />

              {/* removes the photo picked but not saved yet */}
              {photo && (
                <button
                  type="button"
                  aria-label="Remove new photo"
                  onClick={() => setPhoto(null)}
                  className="bg-[#EB3D4D] w-8 h-8 rounded-full flex items-center
                  justify-center border-[1.5px] border-white absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4"
                >
                  <TrashIcon />
                </button>
              )}
            </div>

            {/* Drag & Drop */}
            <div className="flex-1 min-w-0">
              <FileInput
                dragAndDrop
                fullWidth
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="Upload profile picture"
                onChange={pick}
                inputClassName="w-full bg-grayBg border border-dashed border-borderColor rounded-xl"
                wrapperClassName="w-full"
              />
            </div>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 mt-4 gap-4">
            <GenericInput
              label="First Name"
              placeholder="Enter your first name"
              value={form.first_name}
              onChange={set("first_name")}
              maxLength={255}
              fullWidth
            />
            <GenericInput
              label="Last Name"
              placeholder="Enter your last name"
              value={form.last_name}
              onChange={set("last_name")}
              maxLength={255}
              fullWidth
            />
            <GenericInput
              label="Email Address"
              value={email}
              readOnly
              helperText="Your sign-in email can't be changed here."
              fullWidth
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <hr className="hidden md:block border-borderColor mt-6" />

      {/* Button */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 my-4 sm:mt-15">
        <GenericButton variant="primary" className="w-full sm:w-auto" onClick={save} loading={saving}>
          Save Changes
        </GenericButton>
      </div>
    </div>
  );
};

export default ProfileContent;
