"use client";

import { useSyncExternalStore } from "react";

const DESKTOP_MQ = "(min-width: 1024px)";

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_MQ).matches;
}

/** Phones and tablets use the mobile trading UI; charts only from 1024px. */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
