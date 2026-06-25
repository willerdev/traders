"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Trophy,
  Wallet,
  Settings,
  LogOut,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/submit", label: "Submit Signal", shortLabel: "Submit", icon: Send },
  { href: "/leaderboard", label: "Leaderboard", shortLabel: "Ranks", icon: Trophy },
  { href: "/tp-claims", label: "TP Claims", shortLabel: "Claims", icon: ClipboardCheck },
  { href: "/payouts", label: "Payouts", shortLabel: "Payouts", icon: Wallet },
  { href: "/settings", label: "Settings", shortLabel: "Account", icon: Settings },
];

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Logo className="text-lg" />
        </Link>
        <div className="flex gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Login
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-col gap-1 p-2", className)}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={onNavigate}
            className={cn(
              "flex items-center rounded-lg py-2.5 pl-[0.85rem] pr-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span
              className={cn(
                "ml-3 overflow-hidden whitespace-nowrap transition-all duration-300",
                "max-w-0 opacity-0",
                "group-hover/sidebar:max-w-[10rem] group-hover/sidebar:opacity-100",
                "group-focus-within/sidebar:max-w-[10rem] group-focus-within/sidebar:opacity-100",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { logout } = useAuthStore();

  return (
    <aside
      className={cn(
        "group/sidebar fixed left-0 top-0 z-50 hidden h-screen flex-col",
        "border-r border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl",
        "w-[4.25rem] transition-[width] duration-300 ease-in-out",
        "hover:w-56 focus-within:w-56",
        "md:flex",
      )}
    >
      <Link
        href="/dashboard"
        className="flex h-16 shrink-0 items-center border-b border-[var(--color-border)] px-4"
        title="TraderRank Pro"
      >
        <Logo className="text-sm whitespace-nowrap" />
      </Link>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <SidebarNav pathname={pathname} />
      </div>

      <div className="border-t border-[var(--color-border)] p-2">
        <Link
          href="/settings"
          title="Settings"
          className="flex w-full items-center rounded-lg py-2.5 pl-[0.85rem] pr-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span
            className={cn(
              "ml-3 overflow-hidden whitespace-nowrap transition-all duration-300",
              "max-w-0 opacity-0",
              "group-hover/sidebar:max-w-[10rem] group-hover/sidebar:opacity-100",
              "group-focus-within/sidebar:max-w-[10rem] group-focus-within/sidebar:opacity-100",
            )}
          >
            Settings
          </span>
        </Link>
        <button
          type="button"
          onClick={logout}
          title="Logout"
          className="flex w-full items-center rounded-lg py-2.5 pl-[0.85rem] pr-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span
            className={cn(
              "ml-3 overflow-hidden whitespace-nowrap transition-all duration-300",
              "max-w-0 opacity-0",
              "group-hover/sidebar:max-w-[10rem] group-hover/sidebar:opacity-100",
              "group-focus-within/sidebar:max-w-[10rem] group-focus-within/sidebar:opacity-100",
            )}
          >
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { user } = useAuthStore();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 backdrop-blur-xl md:hidden">
      <Link href="/dashboard" className="flex items-center">
        <Logo compact className="text-sm" />
      </Link>
      <Link
        href="/settings"
        className="flex max-w-[8rem] items-center gap-2 truncate text-xs text-muted"
      >
        <span className="truncate">{user?.displayName}</span>
      </Link>
    </header>
  );
}

function MobileBottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 transition-colors",
                active ? "text-primary" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              <span
                className={cn(
                  "truncate text-[10px] font-medium leading-none",
                  active && "font-semibold",
                )}
              >
                {item.shortLabel}
              </span>
              {active && (
                <span className="absolute bottom-1 h-0.5 w-8 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <PublicHeader />;
  }

  return (
    <>
      <Sidebar pathname={pathname} />
      <MobileHeader />
      <MobileBottomNav pathname={pathname} />
    </>
  );
}

export function MainContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  return (
    <main
      className={cn(
        "flex-1",
        isAuthenticated && "pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0 md:pl-[4.25rem]",
      )}
    >
      {children}
    </main>
  );
}
