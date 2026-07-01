"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Home,
  Send,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const cashRoutes = ["/tp-claims", "/payouts", "/settings"] as const;

const cashMenuItems = [
  { href: "/tp-claims", label: "Claims", icon: ClipboardCheck },
  { href: "/payouts", label: "Payouts", icon: Wallet },
  { href: "/settings", label: "Account", icon: Settings },
] as const;

const sideTabs = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/submit", label: "Submit", icon: Send },
] as const;

const mt5Tab = { href: "/mt5", label: "MT5" };

function isMt5Path(pathname: string) {
  return pathname === "/mt5" || pathname.startsWith("/mt5/");
}

function SideNavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href?: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex h-9 min-w-[3.25rem] items-center justify-center rounded-full transition-all duration-200",
          active
            ? "bg-primary text-white shadow-md shadow-primary/30"
            : "text-[var(--nav-dock-inactive)]",
        )}
      >
        <Icon
          className="h-[1.35rem] w-[1.35rem]"
          strokeWidth={active ? 2.25 : 1.75}
          fill={active ? "currentColor" : "none"}
        />
      </span>
      <span
        className={cn(
          "text-[10px] font-medium leading-none transition-colors",
          active ? "font-semibold text-primary" : "text-[var(--nav-dock-inactive)]",
        )}
      >
        {label}
      </span>
    </>
  );

  const className =
    "flex flex-1 flex-col items-center justify-end gap-1 pb-0.5 pt-2 transition-transform active:scale-95";

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

  const cashOpen = cashAt === pathname;
  const setCashOpen = (open: boolean) => setCashAt(open ? pathname : null);

  const cashActive = cashRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const mt5Active = isMt5Path(pathname);

  useEffect(() => {
    if (!cashOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCashOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cashOpen]);

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
            <p className="text-sm font-semibold">Cash</p>
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
          className="pointer-events-auto mx-3 flex max-w-lg items-end justify-between rounded-[1.35rem] border border-[var(--nav-dock-border)] bg-[var(--nav-dock-bg)] px-1 pb-1.5 pt-2 sm:mx-auto"
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
            active={pathname === sideTabs[1].href}
          />

          <div className="flex flex-1 flex-col items-center">
            <Link
              href={mt5Tab.href}
              className={cn(
                "relative -mt-7 flex h-[3.35rem] w-[3.35rem] items-center justify-center rounded-full transition-transform active:scale-95",
                "bg-primary text-white shadow-lg shadow-primary/40",
                "ring-[3px] ring-[var(--nav-dock-bg)]",
                !mt5Active && "opacity-95",
              )}
              aria-label={mt5Tab.label}
            >
              <span className="text-xl font-bold leading-none">$</span>
            </Link>
            <span
              className={cn(
                "mt-1.5 text-[10px] font-medium leading-none",
                mt5Active ? "font-semibold text-primary" : "text-[var(--nav-dock-inactive)]",
              )}
            >
              {mt5Tab.label}
            </span>
          </div>

          <SideNavItem
            label="Cash"
            icon={Wallet}
            active={cashActive || cashOpen}
            onClick={() => setCashOpen(!cashOpen)}
          />
        </nav>
      </div>
    </>
  );
}
