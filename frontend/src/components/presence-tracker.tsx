"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const HEARTBEAT_MS = 20_000;

/** Keeps the server updated on which page this signed-in user is viewing. */
export function PresenceTracker() {
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const lastSent = useRef<string>("");

  useEffect(() => {
    if (!token) return;

    const send = (path: string) => {
      if (path === lastSent.current) return;
      lastSent.current = path;
      void api.presence.heartbeat(path).catch(() => undefined);
    };

    send(pathname);

    const timer = setInterval(() => send(pathname), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") send(pathname);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, pathname]);

  return null;
}
