"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { BlockchainNotification } from "@/lib/blockchain/types";
import { GlassCard, Skeleton } from "./ui-kit";

export function NotificationsPanel({
  items,
  loading,
}: {
  items: BlockchainNotification[];
  loading: boolean;
}) {
  const [toasts, setToasts] = useState<BlockchainNotification[]>([]);

  useEffect(() => {
    const unread = items.filter((n) => !n.read).slice(0, 3);
    setToasts(unread);
  }, [items]);

  if (loading) return <Skeleton className="h-56" />;

  return (
    <>
      <GlassCard title="Notifications">
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs text-muted">{n.message}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-80 flex-col gap-2 sm:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, x: 8 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className="pointer-events-auto rounded-2xl border border-primary/30 bg-[var(--color-surface)]/95 p-4 shadow-xl backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="mt-1 text-xs text-muted">{t.message}</p>
                </div>
                <button
                  type="button"
                  className="text-muted hover:text-foreground"
                  onClick={() =>
                    setToasts((prev) => prev.filter((x) => x.id !== t.id))
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
