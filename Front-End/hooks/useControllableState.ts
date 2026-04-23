import { useCallback, useState } from "react";

export function useControllableState<T>(
  controlled: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void
): [T, (value: T) => void] {
  const [internal, setInternal] = useState<T>(defaultValue);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : internal;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange]
  );

  return [value, setValue];
}