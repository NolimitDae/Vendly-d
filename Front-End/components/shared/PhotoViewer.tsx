"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * A photo shown full screen, uncropped, over the page (a package's or a rental's photos). Arrows, the
 * keyboard (← → Esc) and a swipe on phones move between the photos; tapping outside the photo closes it.
 */
export default function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  title,
}: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  title?: string;
}) {
  const count = photos.length;
  const go = (step: number) => onIndex((index + step + count) % count);
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && count > 1) onIndex((index + 1) % count);
      else if (e.key === "ArrowLeft" && count > 1) onIndex((index - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    // the page behind doesn't scroll while the photo is open
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, count, onIndex, onClose]);

  useEffect(() => closeRef.current?.focus(), []);

  if (!photos[index]) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} photos` : "Photos"}
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null || count < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
      {count > 1 && (
        <p className="absolute top-5 left-1/2 -translate-x-1/2 z-10 text-sm text-white/80" aria-live="polite">
          {index + 1} / {count}
        </p>
      )}

      <div className="relative h-[85vh] w-[94vw] max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <Image src={photos[index]} alt={title ? `${title}, photo ${index + 1}` : `Photo ${index + 1}`} fill sizes="100vw" className="object-contain" priority />
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Next photo"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}
    </div>
  );
}
