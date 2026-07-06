"use client";

import { useCallback, useEffect, useState } from "react";

function readParam<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): T {
  if (typeof window === "undefined") return defaultValue;
  const raw = new URLSearchParams(window.location.search).get(key);
  return raw && allowed.includes(raw as T) ? (raw as T) : defaultValue;
}

/** Keep tab/step state in the URL so refresh and share links restore the view. */
export function useUrlTab<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [value, setValueState] = useState<T>(() =>
    readParam(key, defaultValue, allowed),
  );

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);
      if (next === defaultValue) params.delete(key);
      else params.set(key, next);

      const qs = params.toString();
      const url = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      window.history.replaceState(null, "", url);
    },
    [key, defaultValue],
  );

  useEffect(() => {
    const onPop = () => {
      setValueState(readParam(key, defaultValue, allowed));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key, defaultValue, allowed]);

  return [value, setValue];
}
