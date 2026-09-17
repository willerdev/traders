"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api, type PlatformNotification } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PlatformNotificationsBell({
  compact = false,
}: {
  /** Icon-only layout (collapsed sidebar). */
  compact?: boolean;
}) {
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PlatformNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await api.notifications.list(20);
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      /* ignore when offline */
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function markRead(n: PlatformNotification) {
    if (n.readAt) return;
    try {
      await api.notifications.markRead(n.id);
      setItems((prev) =>
        prev.map((row) =>
          row.id === n.id ? { ...row, readAt: new Date().toISOString() } : row,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    try {
      await api.notifications.markAllRead();
      setItems((prev) =>
        prev.map((row) => ({
          ...row,
          readAt: row.readAt ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div ref={panelRef} className="relative w-full">
      <button
        type="button"
        title="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground",
          compact && "justify-center px-0",
        )}
      >
        <span className="relative shrink-0">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
        {!compact && (
          <span className="truncate">
            Notifications
            {unreadCount > 0 ? ` (${unreadCount})` : ""}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-[70] max-h-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-background shadow-2xl",
            // Desktop: fly out beside the sidebar so it never covers nav items.
            "bottom-0 left-full ml-2 w-80",
            // Narrow / mobile drawer: open upward inside the panel.
            "max-md:bottom-full max-md:left-0 max-md:right-0 max-md:mb-2 max-md:ml-0 max-md:w-auto",
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted">No notifications yet</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "border-b border-[var(--color-border)] px-3 py-2.5 last:border-0",
                    !n.readAt && "bg-primary/5",
                  )}
                >
                  {n.linkUrl ? (
                    <Link
                      href={n.linkUrl}
                      onClick={() => {
                        void markRead(n);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      <NotificationRow n={n} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => void markRead(n)}
                    >
                      <NotificationRow n={n} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n }: { n: PlatformNotification }) {
  return (
    <>
      <p className="text-sm font-medium text-foreground">{n.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{n.body}</p>
      <p className="mt-1 text-[10px] text-muted/70">{fmtTime(n.createdAt)}</p>
    </>
  );
}
