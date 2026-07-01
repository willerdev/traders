"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const cashRoutes = ["/tp-claims", "/payouts", "/settings"] as const;

const cashMenuItems = [
  { href: "/tp-claims", label: "Claims" },
  { href: "/payouts", label: "Payouts" },
  { href: "/settings", label: "Account" },
] as const;

const tabs = [
  { href: "/dashboard", label: "Home" },
  { href: "/submit", label: "Submit" },
  { href: "/mt5", label: "MT5" },
] as const;

function isMt5Path(pathname: string) {
  return pathname === "/mt5" || pathname.startsWith("/mt5/");
}

function NavTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex flex-col items-center justify-center py-2 transition-colors",
        active ? "text-primary" : "text-muted hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-semibold leading-none tracking-wide",
          active && "text-primary",
        )}
      >
        {label}
      </span>
      {active && (
        <span className="absolute bottom-0.5 h-0.5 w-8 rounded-full bg-primary" />
      )}
    </Link>
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
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setCashOpen(false)}
                    className={cn(
                      "flex items-center rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-foreground/5",
                    )}
                  >
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
        <div className="relative mx-auto grid h-14 max-w-lg grid-cols-4 items-center px-1">
          <NavTab
            href={tabs[0].href}
            label={tabs[0].label}
            active={pathname === tabs[0].href}
          />
          <NavTab
            href={tabs[1].href}
            label={tabs[1].label}
            active={pathname === tabs[1].href}
          />

          <div className="relative flex flex-col items-center justify-center">
            <Link
              href={tabs[2].href}
              className={cn(
                "flex h-10 min-w-[3.25rem] items-center justify-center rounded-full px-3 transition-transform active:scale-95",
                mt5Active
                  ? "bg-primary text-white shadow-md"
                  : "bg-[var(--color-background)] text-primary ring-1 ring-[var(--color-border)]",
              )}
              aria-label="MT5"
            >
              <span className="text-[11px] font-bold tracking-wide">MT5</span>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setCashOpen(!cashOpen)}
            className={cn(
              "relative flex flex-col items-center justify-center py-2 transition-colors",
              cashActive || cashOpen
                ? "text-primary"
                : "text-muted hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-semibold leading-none tracking-wide",
                (cashActive || cashOpen) && "text-primary",
              )}
            >
              Cash
            </span>
            {(cashActive || cashOpen) && (
              <span className="absolute bottom-0.5 h-0.5 w-8 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
