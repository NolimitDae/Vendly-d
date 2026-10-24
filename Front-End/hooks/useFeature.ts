"use client";

import { useEffect, useState } from "react";
import { Fetch } from "@/lib/Fetch";

// Feature switches from Admin → Settings. A feature is on unless an admin has switched it off,
// so a slow or failed request never hides anything.
type Flags = { on: string[]; off: string[] };
let cache: Promise<Flags> | null = null;
const flags = () =>
  (cache ??= Fetch.get("/flags")
    .then((r) => ({ on: (r.data?.data as string[] | undefined) ?? [], off: (r.data?.disabled as string[] | undefined) ?? [] }))
    .catch(() => {
      cache = null;
      return { on: [], off: [] };
    }));

export function useFeature(key: string): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let alive = true;
    flags().then((f) => alive && setOn(!f.off.includes(key)));
    return () => {
      alive = false;
    };
  }, [key]);
  return on;
}

/**
 * For features that stay off until an admin switches them on (such as vendor plans): true only
 * once the flag is on. Undefined while loading; a failed request reads as off.
 */
export function useFeatureOptIn(key: string): boolean | undefined {
  const [on, setOn] = useState<boolean>();
  useEffect(() => {
    let alive = true;
    flags().then((f) => alive && setOn(f.on.includes(key)));
    return () => {
      alive = false;
    };
  }, [key]);
  return on;
}
