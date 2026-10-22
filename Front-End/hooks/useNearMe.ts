"use client";

import { useCallback, useEffect, useState } from "react";

export type NearMeStatus = "idle" | "asking" | "on" | "denied" | "unsupported" | "error";
export interface Coords {
  lat: number;
  lng: number;
}

const OPT_IN_KEY = "vendly.nearMe";
const DISMISS_KEY = "vendly.nearMe.dismissed";

const store = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* private mode: nothing to remember */
    }
  },
};

/** ~11 m precision is plenty for "near me" and avoids sending an exact position. */
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Asks the browser for the visitor's location to find vendors near them.
 * Someone who turned it on before gets it back on their next visit without being asked again,
 * as long as the browser still allows it.
 */
export function useNearMe() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<NearMeStatus>("idle");
  const [dismissed, setDismissed] = useState(true);

  const locate = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          setStatus("unsupported");
          return resolve(false);
        }
        setStatus("asking");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCoords({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) });
            setStatus("on");
            store.set(OPT_IN_KEY, "1");
            resolve(true);
          },
          (err) => {
            setCoords(null);
            if (err.code === err.PERMISSION_DENIED) {
              setStatus("denied");
              store.set(OPT_IN_KEY, null);
            } else setStatus("error");
            resolve(false);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
        );
      }),
    [],
  );

  useEffect(() => {
    setDismissed(store.get(DISMISS_KEY) === "1");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    const optedIn = store.get(OPT_IN_KEY) === "1";
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) {
      if (optedIn) void locate();
      return;
    }
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state === "denied") setStatus("denied");
        else if (p.state === "granted" && optedIn) void locate();
      })
      .catch(() => optedIn && void locate());
  }, [locate]);

  const turnOff = useCallback(() => {
    setCoords(null);
    setStatus("idle");
    store.set(OPT_IN_KEY, null);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    store.set(DISMISS_KEY, "1");
  }, []);

  return { coords, status, active: status === "on" && !!coords, locate, turnOff, dismissed, dismiss };
}
