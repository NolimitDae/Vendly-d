"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, X } from "lucide-react";
import { GeoService, type Place } from "@/service/geo/geo.service";
import { cn } from "@/lib/utils";

export interface PickedPlace {
  label: string;
  /** set when picked from suggestions or the browser's position; typed text is geocoded on save */
  lat?: number;
  lng?: number;
}

export const SERVICE_RADII = [
  { value: 0, label: "Customers come to me" },
  { value: 10, label: "10 mi" },
  { value: 25, label: "25 mi" },
  { value: 50, label: "50 mi" },
  { value: 100, label: "100 mi" },
];

const position = (maximumAge: number) =>
  new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge }),
  );

/** Package location with address suggestions as you type, "use my current location", and how far the vendor travels. */
export default function LocationField({
  value,
  onChange,
  radius,
  onRadiusChange,
}: {
  value: PickedPlace;
  onChange: (p: PickedPlace) => void;
  radius: number | null;
  onRadiusChange: (miles: number) => void;
}) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const near = useRef<{ lat: number; lng: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef("");

  // bias suggestions to where the vendor is, only if the browser already allows location (never prompts here)
  useEffect(() => {
    const perms = typeof navigator !== "undefined" ? (navigator as Navigator & { permissions?: Permissions }).permissions : undefined;
    perms
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => (p.state === "granted" ? position(30 * 60 * 1000) : null))
      .then((pos) => {
        if (pos) near.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      })
      .catch(() => {});
    return () => clearTimeout(timer.current);
  }, []);

  const type = (text: string) => {
    onChange({ label: text }); // typed text: position unknown until picked
    setError("");
    latest.current = text;
    setActive(-1);
    clearTimeout(timer.current);
    if (text.trim().length < 2) return setSuggestions([]);
    timer.current = setTimeout(async () => {
      try {
        const res = await GeoService.suggest(text, near.current);
        if (latest.current === text) {
          setSuggestions(res.data?.data ?? []);
          setOpen(true);
        }
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const pick = (p: Place) => {
    // a lookup still in flight for the typed text mustn't reopen the list
    clearTimeout(timer.current);
    latest.current = "";
    onChange(p);
    setSuggestions([]);
    setOpen(false);
  };

  const useCurrent = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return setError("This browser can't share a location. Type the city instead.");
    setLocating(true);
    setError("");
    try {
      const pos = await position(10 * 60 * 1000);
      const res = await GeoService.reverse(pos.coords.latitude, pos.coords.longitude);
      const place = res.data?.data;
      if (!place) setError("We couldn't name this spot. Type the city instead.");
      else pick(place);
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setError(
        denied
          ? "Location is blocked for this site. Allow it in your browser's site settings, or type the city instead."
          : "We couldn't get your location. Type the city instead.",
      );
    } finally {
      setLocating(false);
    }
  };

  const showList = open && suggestions.length > 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // don't submit the form
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <MapPin
          className={cn(
            "w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none",
            value.lat != null ? "text-primary" : "text-gray-400",
          )}
        />
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-label="Package location"
          value={value.label}
          onChange={(e) => type(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Start typing a city or address"
          autoComplete="off"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
        />
        {!!value.label && (
          <button
            type="button"
            onClick={() => {
              onChange({ label: "" });
              setSuggestions([]);
            }}
            aria-label="Clear location"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {showList && (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label="Suggested places"
            className="absolute z-20 mt-2 w-full rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
          >
            {suggestions.map((p, i) => (
              <li
                key={`${p.label}${p.lat}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm text-gray-900 dark:text-white cursor-pointer",
                  i === active && "bg-gray-50 dark:bg-gray-700/60",
                )}
              >
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate">{p.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={useCurrent}
        disabled={locating}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60"
      >
        {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
        Use my current location
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How far will you travel?</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICE_RADII.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={radius === r.value}
              onClick={() => onRadiusChange(r.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm border transition",
                radius === r.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {radius == null
            ? "Pick how far you travel so customers nearby find this package with Near me."
            : radius
              ? `Customers within ${radius} miles of this location will find this package with Near me.`
              : "Customers come to you at this location."}
        </p>
      </fieldset>
    </div>
  );
}

/** Adds the location, its map position when known, and the service radius to a package form. */
export function appendPlace(fd: FormData, place: PickedPlace, radius: number | null, editing: boolean) {
  const location = place.label.trim();
  // when editing, an empty location clears the old one
  if (location || editing) fd.append("location", location);
  if (location && place.lat != null && place.lng != null) {
    fd.append("lat", String(place.lat));
    fd.append("lng", String(place.lng));
  }
  if (radius != null) fd.append("service_radius_miles", String(radius));
}
