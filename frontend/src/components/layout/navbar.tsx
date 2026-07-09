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
  MessageCircle,
  LineChart,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { UserAvatar } from "@/components/layout/user-avatar";
import { PlatformNotificationsBell } from "@/components/layout/platform-notifications-bell";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { ChatFab } from "@/components/layout/chat-fab";

const navItems = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/invest", label: "Invest", shortLabel: "Invest", icon: TrendingUp },
  { href: "/wallet", label: "Wallet", shortLabel: "Wallet", icon: Wallet },
  { href: "/journal", label: "Journal", shortLabel: "Journal", icon: ScrollText },
  {
    href: "/mt5",
    label: "MT5",
    shortLabel: "MT5",
    icon: LineChart,
  },
  { href: "/submit", label: "Submit Signal", shortLabel: "Submit", icon: Send },
  { href: "/leaderboard", label: "Leaderboard", shortLabel: "Ranks", icon: Trophy },
  { href: "/tp-claims", label: "TP Claims", shortLabel: "Claims", icon: ClipboardCheck },
  { href: "/messages", label: "Messages", shortLabel: "Chat", icon: MessageCircle },
  { href: "/payouts", label: "Payouts", shortLabel: "Payouts", icon: Wallet },
  { href: "/settings", label: "Settings", shortLabel: "Account", icon: Settings },
] as const;

type NavItem = (typeof navItems)[number];

function visibleNavItems(role?: string | null): NavItem[] {
  return navItems.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || role === "ADMIN",
  );
}

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
  items,
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
  items: NavItem[];
}) {
  return (
    <nav className={cn("flex flex-col gap-1 p-2", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={onNavigate}
            className={cn(
              "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
              "justify-center px-0",
              "group-hover/sidebar:justify-start group-hover/sidebar:pl-[0.85rem] group-hover/sidebar:pr-3",
              "group-focus-within/sidebar:justify-start group-focus-within/sidebar:pl-[0.85rem] group-focus-within/sidebar:pr-3",
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
  const { logout, user } = useAuthStore();
  const items = visibleNavItems(user?.role);

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
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-[var(--color-border)]",
          "justify-center px-0",
          "group-hover/sidebar:justify-start group-hover/sidebar:px-4",
          "group-focus-within/sidebar:justify-start group-focus-within/sidebar:px-4",
        )}
        title="TraderRank Pro"
      >
        <Logo sidebar />
      </Link>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <SidebarNav pathname={pathname} items={items} />
      </div>

      <PlatformNotificationsBell />

      <div className="border-t border-[var(--color-border)] p-2">
        <Link
          href="/settings"
          title="Settings"
          className={cn(
            "flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground",
            "justify-center px-0",
            "group-hover/sidebar:justify-start group-hover/sidebar:pl-[0.85rem] group-hover/sidebar:pr-3",
            "group-focus-within/sidebar:justify-start group-focus-within/sidebar:pl-[0.85rem] group-focus-within/sidebar:pr-3",
          )}
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
          className={cn(
            "flex w-full items-center rounded-lg py-2.5 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground",
            "justify-center px-0",
            "group-hover/sidebar:justify-start group-hover/sidebar:pl-[0.85rem] group-hover/sidebar:pr-3",
            "group-focus-within/sidebar:justify-start group-focus-within/sidebar:pl-[0.85rem] group-focus-within/sidebar:pr-3",
          )}
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
  const dashboardUser = useDashboardStore((s) => s.data?.user);
  const avatarUrl = dashboardUser?.avatarUrl ?? user?.avatarUrl ?? null;
  const displayName = user?.displayName ?? dashboardUser?.displayName;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 backdrop-blur-xl md:hidden">
      <Link href="/dashboard" className="flex items-center">
        <Logo compact className="text-xl font-bold tracking-tight" />
      </Link>
      <Link
        href="/settings"
        className="flex min-w-0 max-w-[55%] items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-foreground/5"
      >
        <UserAvatar name={displayName} src={avatarUrl} size="sm" />
        <span className="truncate text-sm font-medium text-foreground">
          {displayName}
        </span>
      </Link>
    </header>
  );
}

function isMt5Route(pathname: string) {
  return pathname === "/mt5" || pathname.startsWith("/mt5/");
}

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const hideMobileHeader = isMt5Route(pathname);

  if (!isAuthenticated) {
    return <PublicHeader />;
  }

  return (
    <>
      <Sidebar pathname={pathname} />
      {!hideMobileHeader && <MobileHeader />}
      <MobileBottomNav />
      <ChatFab />
    </>
  );
}

export function MainContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  return (
    <main
      className={cn(
        "flex-1",
        isAuthenticated &&
          "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:pb-0",
        isAuthenticated && "md:pl-[4.25rem]",
      )}
    >
      {children}
    </main>
  );
}
