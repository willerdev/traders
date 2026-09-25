"use client";

import { useCallback, useEffect, useState } from "react";

const FORCE_MOBILE = "mt5-force-mobile";

function readFlag(key: string) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    if (on) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useDismissFlag(key: string) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readFlag(key));
  }, [key]);

  const dismiss = useCallback(() => {
    writeFlag(key, true);
    setHidden(true);
  }, [key]);

  const restore = useCallback(() => {
    writeFlag(key, false);
    setHidden(false);
  }, [key]);

  return { hidden, dismiss, restore };
}

export function applyForceMobileLayout(on: boolean) {
  writeFlag(FORCE_MOBILE, on);
  document.documentElement.classList.toggle(FORCE_MOBILE, on);
}

export function useForceMobileLayout() {
  const [forced, setForced] = useState(false);

  useEffect(() => {
    const on = readFlag(FORCE_MOBILE);
    setForced(on);
    document.documentElement.classList.toggle(FORCE_MOBILE, on);
  }, []);

  const hideChart = useCallback(() => {
    applyForceMobileLayout(true);
    setForced(true);
  }, []);

  const showChart = useCallback(() => {
    applyForceMobileLayout(false);
    setForced(false);
  }, []);

  return { forced, hideChart, showChart };
}
