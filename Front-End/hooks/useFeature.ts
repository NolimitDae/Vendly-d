"use client";

import { useEffect, useState } from "react";
import { Fetch } from "@/lib/Fetch";

// Feature switches from Admin → Settings. A feature is on unless an admin has switched it off,
// so a slow or failed request never hides anything.
let cache: Promise<string[]> | null = null;
const disabledFlags = () =>
  (cache ??= Fetch.get("/flags")
    .then((r) => (r.data?.disabled as string[] | undefined) ?? [])
    .catch(() => {
      cache = null;
      return [];
    }));

export function useFeature(key: string): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let alive = true;
    disabledFlags().then((off) => alive && setOn(!off.includes(key)));
    return () => {
      alive = false;
    };
  }, [key]);
  return on;
}
