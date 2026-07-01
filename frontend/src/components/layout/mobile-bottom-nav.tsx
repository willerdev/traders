"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  LayoutDashboard,
  LineChart,
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

type TabItem = {
  href: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
};

const tabs: TabItem[] = [
  { href: "/dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/submit", shortLabel: "Submit", icon: Send },
  { href: "/mt5", shortLabel: "MT5", icon: LineChart },
];

function isMt5Path(pathname: string) {
  return pathname === "/mt5" || pathname.startsWith("/mt5/");
}

function NavTab({
  item,
  active,
}: {
  item: TabItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 py-2 transition-colors",
        active ? "text-primary" : "text-muted hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
      <span
        className={cn(
          "text-[10px] font-medium leading-none",
          active && "font-semibold",
        )}
      >
        {item.shortLabel}
      </span>
      {active && (
        <span className="absolute bottom-0.5 h-0.5 w-7 rounded-full bg-primary" />
      )}
    </Link>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [cashAt, setCashAt] = useState<string | null>(null);

  const cashOpen = cashAt === pathname;
  const setCashOpen = (open: boolean) =>
    setCashAt(open ? pathname : null);

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

  const Mt5Icon = tabs[2].icon;

  return (
    <>
      {cashOpen && (
        <button
          type="button"
          aria-label="Close cash menu"
          className="fixed inset-0 z-[55] bg-black/50 md:hidden"
          onClick={() => setCashOpen(false)}
        />
      )}

      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[56] md:hidden",
          "transition-transform duration-200 ease-out",
          cashOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto max-w-lg rounded-t-2xl border border-b-0 border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-4 pt-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Cash</p>
            <button
              type="button"
              onClick={() => setCashOpen(false)}
              className="rounded-lg p-1.5 text-muted hover:bg-foreground/5 hover:text-foreground"
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
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-foreground/5",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="relative mx-auto grid h-16 max-w-lg grid-cols-4 items-end px-1">
          <NavTab item={tabs[0]} active={pathname === tabs[0].href} />
          <NavTab item={tabs[1]} active={pathname === tabs[1].href} />

          <div className="relative flex flex-col items-center justify-end pb-1">
            <Link
              href={tabs[2].href}
              className={cn(
                "absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[var(--color-surface)] shadow-lg transition-transform active:scale-95",
                mt5Active
                  ? "bg-primary text-white"
                  : "bg-[var(--color-background)] text-primary ring-1 ring-[var(--color-border)]",
              )}
              aria-label="MT5"
            >
              <Mt5Icon className="h-6 w-6" strokeWidth={2.25} />
            </Link>
            <span
              className={cn(
                "mt-7 text-[10px] font-medium leading-none",
                mt5Active ? "font-semibold text-primary" : "text-muted",
              )}
            >
              MT5
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCashOpen(!cashOpen)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 py-2 transition-colors",
              cashActive || cashOpen
                ? "text-primary"
                : "text-muted hover:text-foreground",
            )}
          >
            <Wallet
              className="h-5 w-5"
              strokeWidth={cashActive || cashOpen ? 2.5 : 2}
            />
            <span
              className={cn(
                "text-[10px] font-medium leading-none",
                (cashActive || cashOpen) && "font-semibold",
              )}
            >
              Cash
            </span>
            {(cashActive || cashOpen) && (
              <span className="absolute bottom-0.5 h-0.5 w-7 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
