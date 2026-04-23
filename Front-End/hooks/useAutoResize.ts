import { useEffect, useRef } from "react";

export function useAutoResize(autoResize: boolean, value: unknown) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoResize || !ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [autoResize, value]);

  return ref;
}