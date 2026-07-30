"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MoreHorizontal,
  PiggyBank,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {content}
    </button>
  );
}

/** Quick dock — “More” opens the full Gyaan-style sidebar drawer. */
export function MobileBottomNav({
  onOpenFullMenu,
}: {
  onOpenFullMenu?: () => void;
}) {
  const pathname = usePathname();

  if (isMt5Path(pathname)) {
    return null;
  }

  const homeActive = pathname === "/dashboard";
  const journalActive = pathActive(pathname, "/journal");
  const investActive = pathActive(pathname, "/invest");
  const walletActive = pathActive(pathname, "/wallet");
  const moreActive =
    !homeActive &&
    !journalActive &&
    !investActive &&
    !walletActive &&
    !isMt5Path(pathname);

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
          onClick={() => onOpenFullMenu?.()}
        />
      </div>
    </nav>
  );
}
