"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs: Array<{
  id: DashboardTab;
  label: string;
  href?: string;
}> = [
  { id: "trader", label: "Trader" },
  { id: "investor", label: "Investor", href: "/invest" },
  { id: "depositor", label: "Depositor" },
  { id: "wallet", label: "Wallet", href: "/wallet" },
];

export type DashboardTab = "trader" | "investor" | "depositor" | "wallet";

export function DashboardHubTabs({
  active,
  className,
}: {
  active: DashboardTab;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const href =
          tab.href ?? `${pathname}?tab=${tab.id}`;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-white"
                : "text-gray-400 hover:text-white",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function useDashboardTab(): DashboardTab {
  const params = useSearchParams();
  const tab = params.get("tab");
  if (tab === "investor" || tab === "depositor" || tab === "wallet") {
    return tab;
  }
  return "trader";
}
