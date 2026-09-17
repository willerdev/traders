"use client";

const STORAGE_KEY = "solo-metaapi-paused";
const WATCH_KEY = "solo-metaapi-watch";
export const METAAPI_LIVE_EVENT = "solo-metaapi-live";

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

let hasOpenTrades = false;

function emitLiveChange() {
  if (!canUseDom()) return;
  window.dispatchEvent(new Event(METAAPI_LIVE_EVENT));
}

export function setMetaApiHasOpenTrades(next: boolean) {
  if (hasOpenTrades === next) return;
  hasOpenTrades = next;
  emitLiveChange();
}

export function isMetaApiWatchForced(): boolean {
  if (!canUseDom()) return false;
  try {
    return sessionStorage.getItem(WATCH_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMetaApiWatchForced(watch: boolean) {
  if (!canUseDom()) return;
  try {
    if (watch) sessionStorage.setItem(WATCH_KEY, "1");
    else sessionStorage.removeItem(WATCH_KEY);
  } catch {
    /* ignore */
  }
  emitLiveChange();
}

export function isMetaApiManuallyPaused(): boolean {
  if (!canUseDom()) return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMetaApiManuallyPaused(paused: boolean) {
  if (!canUseDom()) return;
  try {
    if (paused) sessionStorage.setItem(STORAGE_KEY, "1");
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (paused) {
    try {
      sessionStorage.removeItem(WATCH_KEY);
    } catch {
      /* ignore */
    }
  }
  emitLiveChange();
}

export function isMetaApiPageActive(): boolean {
  if (!canUseDom()) return true;
  if (document.hidden) return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
}

/** Live MetaAPI polling: focused tab, not paused, and either an open trade or See live data. */
export function isMetaApiLive(): boolean {
  if (!isMetaApiPageActive() || isMetaApiManuallyPaused()) return false;
  return hasOpenTrades || isMetaApiWatchForced();
}

export function subscribeMetaApiLive(onChange: () => void): () => void {
  if (!canUseDom()) return () => undefined;
  const handler = () => onChange();
  window.addEventListener("focus", handler);
  window.addEventListener("blur", handler);
  document.addEventListener("visibilitychange", handler);
  window.addEventListener(METAAPI_LIVE_EVENT, handler);
  return () => {
    window.removeEventListener("focus", handler);
    window.removeEventListener("blur", handler);
    document.removeEventListener("visibilitychange", handler);
    window.removeEventListener(METAAPI_LIVE_EVENT, handler);
  };
}
