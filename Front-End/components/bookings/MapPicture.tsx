"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { directionsUrl, TILE_SIZE, tilesAround } from "@/lib/booking-tracker";

/**
 * A small picture of the map around a place, with a pin and an optional Directions link (Google Maps in a
 * new tab). The tiles come through the API's cached proxy, so no map key or SDK is needed.
 */
export default function MapPicture({
  lat,
  lng,
  address,
  height = 180,
  directions = false,
  label = "Map of the booking location",
}: {
  lat?: number | null;
  lng?: number | null;
  /** used for Directions when the position isn't known yet */
  address?: string | null;
  height?: number;
  directions?: boolean;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const known = lat != null && lng != null;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [known]);

  const href = directions ? directionsUrl({ lat, lng, address }) : null;
  if (!known && !href) return null;

  return (
    <div className="space-y-2">
      {known && (
        <div
          ref={box}
          role="img"
          aria-label={address ? `${label}: ${address}` : label}
          className="relative w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700"
          style={{ height }}
        >
          {width > 0 &&
            tilesAround(lat!, lng!, width, height).map((t) => (
              // eslint-disable-next-line @next/next/no-img-element -- map tiles from the API's proxy, positioned by hand
              <img
                key={t.key}
                src={t.url}
                alt=""
                width={TILE_SIZE}
                height={TILE_SIZE}
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
              />
            ))}
          {/* the pin's tip sits on the place */}
          <MapPin
            aria-hidden
            className="absolute w-9 h-9 text-primary fill-primary/25 drop-shadow"
            style={{ left: "calc(50% - 18px)", top: height / 2 - 34 }}
          />
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute right-0 bottom-0 bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-700 rounded-tl"
          >
            © OpenStreetMap contributors
          </a>
        </div>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Navigation className="w-4 h-4" />
          Directions
        </a>
      )}
    </div>
  );
}
