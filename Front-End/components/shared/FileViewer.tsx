"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, FileText, Share2, X } from "lucide-react";

export type FileKind = "image" | "pdf" | "video" | "other";

/** What a file is, from its type (when known) or the extension in its link. */
export function fileKind(url: string, mime?: string | null): FileKind {
  if (mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("video/")) return "video";
  }
  let path = url;
  try {
    path = new URL(url, "https://x").pathname;
  } catch {
    /* keep the raw link */
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return "other";
}

/**
 * A file (photo, PDF, video or document) in a window over the page, instead of a new tab. Share sends
 * the file itself where the browser can (phones: save to Photos or Files, AirDrop, Messages), else its
 * link; "Open full screen" opens it on its own page. Esc or a click outside closes it.
 */
export default function FileViewer({
  url,
  name,
  mime,
  onClose,
  share = true,
}: {
  url: string;
  name: string;
  mime?: string | null;
  onClose: () => void;
  /** false for private documents (ID checks): no share button */
  share?: boolean;
}) {
  const kind = fileKind(url, mime);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const doShare = async () => {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share) {
      // the file itself first, so it can be saved; the link when the browser can't share files
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const fallbackExt = url.split("?")[0].split(".").pop() ?? "";
          const fileName = /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}${fallbackExt.length <= 5 && fallbackExt ? `.${fallbackExt}` : ""}`;
          const file = new File([blob], fileName, { type: blob.type || mime || "" });
          if (nav.canShare?.({ files: [file] })) {
            await nav.share({ files: [file], title: name });
            return;
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
      try {
        await nav.share({ url, title: name });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* nothing more to try; "Open full screen" still works */
    }
  };

  const btn = "inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <div className="flex items-center gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{name}</p>
        {share && (
          <button type="button" onClick={doShare} className={btn} aria-label={copied ? "Link copied" : `Share ${name}`}>
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? "Link copied" : "Share"}</span>
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" className={btn} aria-label={`Open ${name} full screen`}>
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Open full screen</span>
        </a>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
        <div className="flex h-full w-full max-w-5xl items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- private or signed links, shown as they are
            <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
          ) : kind === "pdf" ? (
            <iframe src={url} title={name} className="h-full w-full rounded-lg bg-white" />
          ) : kind === "video" ? (
            <video src={url} controls playsInline className="max-h-full max-w-full rounded-lg" aria-label={name} />
          ) : (
            <div className="rounded-2xl bg-white p-8 text-center dark:bg-gray-800">
              <FileText className="mx-auto mb-3 h-10 w-10 text-primary" />
              <p className="font-medium text-gray-900 dark:text-white">{name}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This file can&apos;t be previewed here.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="gradient-bg mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white">
                <ExternalLink className="h-4 w-4" /> Open the file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
