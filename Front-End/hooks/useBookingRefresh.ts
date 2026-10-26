"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "./useNotifications";

/**
 * Reloads a booking page when something happens to it: a live notification about this booking arrives
 * (the vendor is on the way, has arrived, started…), or the visitor comes back to the tab.
 */
export function useBookingRefresh(bookingId: string | undefined, reload: () => void) {
  const { notifications } = useNotifications();
  const latest = notifications[0];
  const seen = useRef<string | undefined>(latest?.id);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!latest || latest.id === seen.current) return;
    seen.current = latest.id;
    if (bookingId && latest.entity_id === bookingId) reloadRef.current();
  }, [latest, bookingId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
