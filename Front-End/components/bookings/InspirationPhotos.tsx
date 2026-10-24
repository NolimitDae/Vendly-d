"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "react-toastify";

export const REQUEST_MAX_PHOTOS = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

interface Picked {
  file: File;
  url: string;
}

/** "Drop your images here (max 10)": reference photos for the vendor, sent with the booking request. */
export function InspirationPhotosPicker({ onChange }: { onChange: (files: File[]) => void }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  // previews are object URLs; free them when the form goes away
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const room = REQUEST_MAX_PHOTOS - picked.length;
    const files = Array.from(list);
    const ok = files.filter((f) => ACCEPT.split(",").includes(f.type) && f.size <= MAX_BYTES);
    if (ok.length < files.length) toast.error("Photos must be JPEG, PNG, WebP or GIF, under 10 MB each.");
    if (ok.length > room) toast.error(`You can add up to ${REQUEST_MAX_PHOTOS} photos.`);
    const next = ok.slice(0, Math.max(0, room)).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    const all = [...picked, ...next];
    setPicked(all);
    onChange(all.map((p) => p.file));
    if (input.current) input.current.value = "";
  };

  const remove = (i: number) => {
    URL.revokeObjectURL(picked[i].url);
    const all = picked.filter((_, j) => j !== i);
    setPicked(all);
    onChange(all.map((p) => p.file));
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Inspiration photos <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
      </p>
      {picked.length < REQUEST_MAX_PHOTOS && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
          className={`w-full rounded-xl border-2 border-dashed px-4 py-5 flex flex-col items-center gap-1 text-sm transition ${
            over ? "border-primary bg-primary/5 text-primary" : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400"
          }`}
        >
          <ImagePlus className="w-5 h-5" aria-hidden />
          <span>Drop your images here (max {REQUEST_MAX_PHOTOS})</span>
          <span className="text-xs">or click to choose. Only you and the vendor can see them.</span>
        </button>
      )}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picked.map((p, i) => (
            <div key={p.url} className="relative w-16 h-16">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={p.url} alt={`Inspiration photo ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900/80 text-white flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={input} type="file" accept={ACCEPT} multiple hidden aria-label="Add inspiration photos" onChange={(e) => add(e.target.files)} />
    </div>
  );
}

/** The photos sent with the request, from short-lived signed links (thumbnails open full size). */
export function InspirationPhotos({ urls, title = "Inspiration photos" }: { urls?: string[] | null; title?: string }) {
  const photos = urls ?? [];
  if (photos.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-gray-400 text-xs">{title}</p>
      <ul aria-label={title} className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed link */}
              <img src={url} alt={`Inspiration photo ${i + 1} of ${photos.length}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
