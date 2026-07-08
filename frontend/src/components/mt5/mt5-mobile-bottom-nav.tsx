"use client";

import { ArrowUpDown, BarChart3, ChartLine, History } from "lucide-react";
import { cn } from "@/lib/utils";

export type Mt5MobileTab = "quotes" | "chart" | "trades" | "history";

const TABS: {
  id: Mt5MobileTab;
  label: string;
  icon: typeof BarChart3;
}[] = [
  { id: "quotes", label: "Quotes", icon: ArrowUpDown },
  { id: "chart", label: "Charts", icon: BarChart3 },
  { id: "trades", label: "Trade", icon: ChartLine },
  { id: "history", label: "History", icon: History },
];

type Props = {
  active: Mt5MobileTab;
  onChange: (tab: Mt5MobileTab) => void;
  badges?: Partial<Record<Mt5MobileTab, number>>;
};

export function Mt5MobileBottomNav({ active, onChange, badges }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[52] border-t border-[var(--mt5-divider)] bg-[var(--mt5-surface)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="MT5 navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 items-end px-2 pb-2 pt-1.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const badge = badges?.[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-1 rounded-lg py-1 transition-transform active:scale-95"
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={cn(
                  "relative flex h-8 min-w-[3rem] items-center justify-center rounded-full transition-all duration-200",
                  isActive
                    ? "bg-primary text-white shadow-sm shadow-primary/30"
                    : "text-[var(--mt5-muted)]",
                )}
              >
                <Icon
                  className="h-[18px] w-[18px]"
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                {badge != null && badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff5252] px-1 text-[9px] font-bold leading-none text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium leading-none",
                  isActive
                    ? "font-semibold text-primary"
                    : "text-[var(--mt5-muted)]",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
