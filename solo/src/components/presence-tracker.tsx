"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const HEARTBEAT_MS = 20_000;

/**
 * Keeps the server updated on which page this signed-in user is viewing.
 * Also re-validates the JWT every 20s — a 401 auto-signs the user out via ApiClient.
 */
export function PresenceTracker() {
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const lastPath = useRef<string>("");

  useEffect(() => {
    if (!token) return;

    const beat = (path: string, force: boolean) => {
      if (!force && path === lastPath.current) return;
      lastPath.current = path;
      // Errors (including session expiry) are handled in ApiClient — 401 → logout.
      void api.presence.heartbeat(path).catch(() => undefined);
    };

    beat(pathname, true);

    const timer = setInterval(() => beat(pathname, true), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") beat(pathname, true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, pathname]);

  return null;
}
