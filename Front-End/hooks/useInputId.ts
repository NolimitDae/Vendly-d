import { useId } from "react";

export function useInputId(providedId?: string): string {
  const generatedId = useId();
  return providedId ?? `input-${generatedId}`;
}