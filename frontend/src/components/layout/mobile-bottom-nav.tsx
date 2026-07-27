"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LineChart,
  MessageCircle,
  MoreHorizontal,
  PiggyBank,
  Blocks,
  ScrollText,
  Settings,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mt5NavHref } from "@/lib/copy-access";
import { useAuthStore, useDashboardStore } from "@/stores/auth";

function isMt5Path(pathname: string) {
  return pathname === "/mt5" || pathname.startsWith("/mt5/");
}

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavTab({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  emphasize,
}: {
  href?: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  onClick?: () => void;
  emphasize?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "relative flex items-center justify-center transition-all duration-200",
          emphasize
            ? cn(
                "-mt-3 h-12 w-12 rounded-2xl shadow-lg",
                active
                  ? "bg-primary text-white shadow-primary/40"
                  : "bg-primary/90 text-white shadow-primary/25",
              )
            : cn(
                "h-8 w-8 rounded-xl",
                active ? "bg-primary/15 text-primary" : "text-[var(--nav-dock-inactive)]",
              ),
        )}
      >
        <Icon
          className={cn(emphasize ? "h-5 w-5" : "h-[18px] w-[18px]")}
          strokeWidth={active || emphasize ? 2.25 : 1.75}
        />
        {active && !emphasize && (
          <span className="absolute -top-1 h-0.5 w-4 rounded-full bg-primary" />
        )}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium leading-none tracking-wide",
          active
            ? "font-semibold text-primary"
            : emphasize
              ? "font-semibold text-foreground"
              : "text-[var(--nav-dock-inactive)]",
        )}
      >
        {label}
      </span>
    </>
  );

  const className = cn(
    "flex min-w-0 flex-1 flex-col items-center justify-end gap-1 py-1.5",
    "touch-manipulation select-none transition-opacity active:opacity-70",
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={label} aria-expanded={active}>
      {content}
    </button>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreAt, setMoreAt] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const dashboardUser = useDashboardStore((s) => s.data?.user);
  const mt5Href = mt5NavHref({
    role: user?.role,
    adminPermissions:
      dashboardUser?.adminPermissions ?? user?.adminPermissions,
  });

  const moreMenuItems = useMemo(
    () =>
      [
        {
          href: mt5Href,
          label: "MT5",
          hint: "Quotes, charts & trade",
          icon: LineChart,
          match: "/mt5",
        },
        {
          href: "/blockchain",
          label: "Blockchain",
          hint: "On-chain invest dashboard",
          icon: Blocks,
          match: "/blockchain",
        },
        {
          href: "/payouts",
          label: "Payouts",
          hint: "Trader payouts",
          icon: Wallet,
          match: "/payouts",
        },
        {
          href: "/messages",
          label: "Support",
          hint: "Agent & admin",
          icon: MessageCircle,
          match: "/messages",
        },
        {
          href: "/settings",
          label: "Settings",
          hint: "Profile, KYC & account",
          icon: Settings,
          match: "/settings",
        },
      ] as const,
    [mt5Href],
  );

  const moreOpen = moreAt === pathname;
  const setMoreOpen = (open: boolean) => setMoreAt(open ? pathname : null);

  const homeActive = pathname === "/dashboard";
  const journalActive = pathActive(pathname, "/journal");
  const investActive = pathActive(pathname, "/invest");
  const walletActive = pathActive(pathname, "/wallet");
  const moreActive =
    moreOpen ||
    moreMenuItems.some((item) => pathActive(pathname, item.match));

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  if (isMt5Path(pathname)) {
    return null;
  }

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          aria-label="Close more menu"
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      <div
        className={cn(
          "mobile-nav-dock fixed inset-x-0 bottom-0 z-[56] md:hidden",
          "transition-transform duration-200 ease-out",
          moreOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        style={{ paddingBottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          className="mx-3 overflow-hidden rounded-2xl border border-[var(--nav-dock-border)] bg-[var(--nav-dock-bg)] sm:mx-auto sm:max-w-lg"
          style={{ boxShadow: "var(--nav-dock-shadow)" }}
        >
          <div className="flex items-center justify-between border-b border-[var(--nav-dock-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">More</p>
              <p className="text-[11px] text-[var(--nav-dock-inactive)]">
                MT5, claims, payouts, support & account
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="rounded-full p-2 text-[var(--nav-dock-inactive)] hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-0.5 p-2">
            {moreMenuItems.map((item) => {
              const Icon = item.icon;
              const active = pathActive(pathname, item.match);
              return (
                <li key={item.match}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                      active
                        ? "bg-primary/12 text-primary"
                        : "text-foreground hover:bg-foreground/5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        active
                          ? "bg-primary text-white"
                          : "bg-foreground/5 text-[var(--nav-dock-inactive)]",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="block text-[11px] text-[var(--nav-dock-inactive)]">
                        {item.hint}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <nav
        className="mobile-nav-dock fixed inset-x-0 bottom-0 z-50 border-t border-[var(--nav-dock-border)] bg-[var(--nav-dock-bg)]/95 backdrop-blur-xl md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -8px 28px rgba(0,0,0,0.28)",
        }}
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-lg items-end px-1 pb-1.5 pt-1">
          <NavTab
            href="/dashboard"
            label="Home"
            icon={Home}
            active={homeActive}
          />
          <NavTab
            href="/journal"
            label="Journal"
            icon={ScrollText}
            active={journalActive}
          />
          <NavTab
            href="/invest"
            label="Invest"
            icon={TrendingUp}
            active={investActive}
            emphasize
          />
          <NavTab
            href="/wallet"
            label="Wallet"
            icon={PiggyBank}
            active={walletActive}
          />
          <NavTab
            label="More"
            icon={MoreHorizontal}
            active={moreActive}
            onClick={() => setMoreOpen(!moreOpen)}
          />
        </div>
      </nav>
    </>
  );
}
