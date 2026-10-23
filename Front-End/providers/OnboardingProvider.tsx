"use client";

import { isLoggedIn as hasSession } from "@/lib/session";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { OnboardingService, type Onboarding } from "@/service/onboarding/onboarding.service";

/** Checking costs a couple of Stripe lookups, so don't re-check more often than this. */
const MIN_GAP_MS = 45_000;

interface Ctx {
  data: Onboarding | null;
  refresh: (force?: boolean) => Promise<void>;
  markSeen: (kind: "intro" | "complete") => void;
}

const OnboardingContext = createContext<Ctx>({ data: null, refresh: async () => {}, markSeen: () => {} });

/** The signed-in role's "get set up" checklist, re-checked when the tab regains focus or the page changes. */
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<Onboarding | null>(null);
  const last = useRef(0);
  const inFlight = useRef(false);
  // popups already shown this session win over a check that was answered before the server recorded them
  const seenHere = useRef(new Set<"intro" | "complete">());

  const refresh = useCallback(async (force = false) => {
    if (!hasSession()) return setData(null);
    if (inFlight.current || (!force && Date.now() - last.current < MIN_GAP_MS)) return;
    inFlight.current = true;
    last.current = Date.now();
    try {
      const res = await OnboardingService.get();
      const d: Onboarding | null = res.data?.success ? res.data.data ?? null : null;
      setData(
        d && {
          ...d,
          popup: d.popup && seenHere.current.has(d.popup) ? null : d.popup,
          visible: seenHere.current.has("complete") ? false : d.visible,
        },
      );
    } catch {
      // keep what we had; the next check tries again
    } finally {
      inFlight.current = false;
    }
  }, []);

  const markSeen = useCallback((kind: "intro" | "complete") => {
    seenHere.current.add(kind);
    setData((d) => (d ? { ...d, popup: null, visible: kind === "complete" ? false : d.visible } : d));
    OnboardingService.seen(kind).catch(() => {});
  }, []);

  // first load forces; later page changes are throttled
  const first = useRef(true);
  useEffect(() => {
    void refresh(first.current);
    first.current = false;
  }, [pathname, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return <OnboardingContext.Provider value={{ data, refresh, markSeen }}>{children}</OnboardingContext.Provider>;
}

export const useOnboarding = () => useContext(OnboardingContext);
