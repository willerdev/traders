"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Home,
  TrendingUp,
  Settings,
  Wallet,
  X,
  PiggyBank,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mt5NavHref } from "@/lib/copy-access";
import { useAuthStore, useDashboardStore } from "@/stores/auth";

const cashRoutes = ["/wallet", "/journal", "/tp-claims", "/payouts", "/settings", "/invest"] as const;

const cashMenuItems = [
  { href: "/wallet", label: "Wallet", icon: PiggyBank },
  { href: "/journal", label: "Journal", icon: ScrollText },
  { href: "/tp-claims", label: "Claims", icon: ClipboardCheck },
  { href: "/payouts", label: "Payouts", icon: Wallet },
  { href: "/settings", label: "Account", icon: Settings },
] as const;

const sideTabs = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/invest", label: "Invest", icon: TrendingUp },
] as const;

const mt5Tab = { href: "/mt5", label: "MT5" } as const;

function isMt5Path(pathname: string) {
  return pathname === "/mt5" || pathname.startsWith("/mt5/");
}

function SideNavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  textOnly,
}: {
  href?: string;
  label: string;
  icon?: typeof Home;
  active: boolean;
  onClick?: () => void;
  textOnly?: boolean;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex items-center justify-center rounded-full transition-all duration-200",
          textOnly
            ? "h-7 min-w-[2.85rem] px-2 text-[10px] font-bold tracking-wide"
            : "h-7 min-w-[2.85rem]",
          active
            ? "bg-primary text-white shadow-sm shadow-primary/25"
            : "text-[var(--nav-dock-inactive)]",
        )}
      >
        {textOnly ? (
          label
        ) : (
          Icon && (
            <Icon
              className="h-4 w-4"
              strokeWidth={active ? 2.25 : 1.75}
              fill={active ? "currentColor" : "none"}
            />
          )
        )}
      </span>
      {!textOnly && (
        <span
          className={cn(
            "text-[10px] font-medium leading-none transition-colors",
            active ? "font-semibold text-primary" : "text-[var(--nav-dock-inactive)]",
          )}
        >
          {label}
        </span>
      )}
    </>
  );

  const className =
    "flex flex-1 flex-col items-center justify-end gap-1 pb-1 pt-1.5 transition-transform active:scale-95";

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {inner}
    </button>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [cashAt, setCashAt] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const dashboardUser = useDashboardStore((s) => s.data?.user);
  const mt5Href = mt5NavHref({
    role: user?.role,
    adminPermissions:
      dashboardUser?.adminPermissions ?? user?.adminPermissions,
  });

  const cashOpen = cashAt === pathname;
  const setCashOpen = (open: boolean) => setCashAt(open ? pathname : null);

  const cashActive = cashRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const investActive = pathname === "/invest" || pathname.startsWith("/invest/");
  const mt5Active = isMt5Path(pathname);

  useEffect(() => {
    if (!cashOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCashOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cashOpen]);

  if (isMt5Path(pathname)) {
    return null;
  }

  return (
    <>
      {cashOpen && (
        <button
          type="button"
          aria-label="Close cash menu"
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={() => setCashOpen(false)}
        />
      )}

      <div
        className={cn(
          "mobile-nav-dock fixed bottom-0 left-0 right-0 z-[56] md:hidden",
          "transition-transform duration-200 ease-out",
          cashOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          className="mx-4 max-w-lg rounded-2xl border border-[var(--nav-dock-border)] bg-[var(--nav-dock-bg)] px-4 pb-4 pt-3 sm:mx-auto"
          style={{ boxShadow: "var(--nav-dock-shadow)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Wallet</p>
            <button
              type="button"
              onClick={() => setCashOpen(false)}
              className="rounded-full p-1.5 text-[var(--nav-dock-inactive)] hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-1">
            {cashMenuItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setCashOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/12 text-primary"
                        : "text-foreground hover:bg-foreground/5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full",
                        active ? "bg-primary text-white" : "bg-foreground/5 text-[var(--nav-dock-inactive)]",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div
        className="mobile-nav-dock pointer-events-none fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <nav
          className="pointer-events-auto mx-3 grid max-w-lg grid-cols-4 items-end rounded-[1.35rem] border border-[var(--nav-dock-border)] bg-[var(--nav-dock-bg)] px-1 pb-2 pt-1.5 sm:mx-auto"
          style={{ boxShadow: "var(--nav-dock-shadow)" }}
          aria-label="Main navigation"
        >
          <SideNavItem
            href={sideTabs[0].href}
            label={sideTabs[0].label}
            icon={sideTabs[0].icon}
            active={pathname === sideTabs[0].href}
          />
          <SideNavItem
            href={sideTabs[1].href}
            label={sideTabs[1].label}
            icon={sideTabs[1].icon}
            active={investActive}
          />
          <SideNavItem
            href={mt5Href}
            label={mt5Tab.label}
            active={mt5Active}
            textOnly
          />
          <SideNavItem
            label="Wallet"
            icon={Wallet}
            active={cashActive || cashOpen}
            onClick={() => setCashOpen(!cashOpen)}
          />
        </nav>
      </div>
    </>
  );
}
