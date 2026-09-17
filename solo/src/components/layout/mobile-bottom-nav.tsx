"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CandlestickChart, Home, MoreHorizontal, PiggyBank, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
          "flex h-8 w-8 items-center justify-center rounded-full",
          active && "bg-primary/15 text-[var(--nav-dock-active)]",
          emphasize && !active && "text-primary",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
      </span>
      <span
        className={cn(
          "text-[10px] font-medium",
          active ? "text-[var(--nav-dock-active)]" : "text-[var(--nav-dock-inactive)]",
        )}
      >
        {label}
      </span>
    </>
  );

  const className = cn(
    "flex flex-1 flex-col items-center gap-0.5 py-1",
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
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {content}
    </button>
  );
}

export function MobileBottomNav({
  onOpenFullMenu,
}: {
  onOpenFullMenu?: () => void;
}) {
  const pathname = usePathname();

  const homeActive = pathname === "/dashboard";
  const investActive = pathActive(pathname, "/invest");
  const walletActive = pathActive(pathname, "/wallet");
  const chainActive = pathActive(pathname, "/blockchain");
  const chartsActive = pathActive(pathname, "/mt5");
  const moreActive =
    !homeActive && !investActive && !walletActive && !chainActive && !chartsActive;

  return (
    <nav
      className="mobile-nav-dock fixed inset-x-0 bottom-0 z-50 border-t border-[var(--nav-dock-border)] bg-[var(--nav-dock-bg)]/95 backdrop-blur-xl md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -8px 28px rgba(0,0,0,0.28)",
      }}
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-end px-1 pb-1.5 pt-1">
        <NavTab href="/dashboard" label="Home" icon={Home} active={homeActive} />
        <NavTab href="/invest" label="Invest" icon={TrendingUp} active={investActive} emphasize />
        <NavTab href="/wallet" label="Wallet" icon={PiggyBank} active={walletActive} />
        <NavTab href="/mt5" label="Trade" icon={CandlestickChart} active={chartsActive} />
        <NavTab
          label="More"
          icon={MoreHorizontal}
          active={moreActive}
          onClick={() => onOpenFullMenu?.()}
        />
      </div>
    </nav>
  );
}
