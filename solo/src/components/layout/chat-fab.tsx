"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

export function ChatFab() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [unread, setUnread] = useState(0);

  const hidden =
    !isAuthenticated ||
    pathname === "/messages" ||
    pathname.startsWith("/mt5");

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const res = await api.messages.unreadCount();
        if (!cancelled) setUnread(res.count);
      } catch {
        /* optional */
      }
    };

    const start = window.setTimeout(() => {
      void pull();
    }, 0);
    const id = window.setInterval(() => {
      void pull();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <Link
      href="/messages"
      className={cn(
        "fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-lg md:hidden",
        "bg-primary text-white transition-transform active:scale-95",
        "right-4",
      )}
      style={{
        bottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px) + 0.25rem)",
      }}
      aria-label="Open chat"
    >
      <MessageCircle className="h-6 w-6" strokeWidth={2} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff5252] px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
