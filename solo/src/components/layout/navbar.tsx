"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Settings,
  LogOut,
  TrendingUp,
  Blocks,
  PanelLeftClose,
  PanelLeft,
  Search,
  ChevronUp,
  Menu,
  X,
  ShieldCheck,
  Clock,
  LineChart,
  CandlestickChart,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { Logo } from "@/components/layout/logo";
import { UserAvatar } from "@/components/layout/user-avatar";
import { PlatformNotificationsBell } from "@/components/layout/platform-notifications-bell";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

const SIDEBAR_EXPANDED_KEY = "trp-sidebar-expanded";

type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: NavIcon;
  keywords?: string;
};

type NavGroup = {
  id: string;
  label?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        shortLabel: "Home",
        icon: LayoutDashboard,
        keywords: "home overview",
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      {
        href: "/wallet",
        label: "Wallet",
        shortLabel: "Wallet",
        icon: Wallet,
        keywords: "deposit withdraw",
      },
      {
        href: "/wallet/auto-withdraw",
        label: "Auto-withdraw",
        shortLabel: "Auto",
        icon: Clock,
        keywords: "daily automatic withdraw schedule",
      },
      {
        href: "/invest",
        label: "Smart Invest",
        shortLabel: "Invest",
        icon: TrendingUp,
        keywords: "yield capital",
      },
      {
        href: "/blockchain",
        label: "Contract",
        shortLabel: "Chain",
        icon: Blocks,
        keywords: "chain on-chain",
      },
      {
        href: "/deriv",
        label: "Deriv",
        shortLabel: "Deriv",
        icon: LineChart,
        keywords: "mt5 token trades transfer",
      },
      {
        href: "/mt5",
        label: "Trading",
        shortLabel: "Trade",
        icon: CandlestickChart,
        keywords: "mt5 chart live trades metaapi trading",
      },
      {
        href: "/journal",
        label: "Journal",
        shortLabel: "Journal",
        icon: BookOpen,
        keywords: "history pnl mt5 deriv wallet calendar",
      },
    ],
  },
  {
    id: "account",
    items: [
      {
        href: "/settings",
        label: "Settings",
        shortLabel: "Account",
        icon: Settings,
        keywords: "password",
      },
    ],
  },
];

function resolveGroups(): NavGroup[] {
  return NAV_GROUPS;
}

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Logo className="text-lg" />
        </Link>
      </div>
    </header>
  );
}

function SidebarBrand({ expanded }: { expanded: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 px-3",
        !expanded && "justify-center px-0",
      )}
      title="solo Emma"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
        <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
      </span>
      {expanded && (
        <span className="truncate font-bold text-foreground">
          solo<span className="text-primary">Emma</span>
        </span>
      )}
    </Link>
  );
}

function SidebarShell({
  expanded,
  onToggleExpanded,
  pathname,
  onNavigate,
  mobile,
  onClose,
}: {
  expanded: boolean;
  onToggleExpanded?: () => void;
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const { logout, user } = useAuthStore();
  const groups = useMemo(() => resolveGroups(), []);
  const [query, setQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [userMenuOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const hay = `${item.label} ${item.shortLabel} ${item.keywords ?? ""}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const displayName = user?.displayName ?? "Account";
  const email = user?.email ?? "";
  const avatarUrl = user?.avatarUrl ?? null;
  const showLabels = expanded || Boolean(mobile);

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/20",
        mobile && "rounded-none border-0 shadow-none",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 border-b border-[var(--color-border)]",
          showLabels ? "justify-between pr-2" : "flex-col gap-1 py-2",
        )}
      >
        <SidebarBrand expanded={showLabels} />
        {mobile ? (
          <button
            type="button"
            onClick={onClose}
            className="mr-2 rounded-xl p-2 text-muted hover:bg-foreground/5 hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          onToggleExpanded && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="rounded-xl p-2 text-muted hover:bg-foreground/5 hover:text-foreground"
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </button>
          )
        )}
      </div>

      {showLabels ? (
        <div className="px-3 pt-3">
          <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-background/40 px-3 py-2 text-sm text-muted focus-within:border-primary/40">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted"
            />
            {query && (
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground"
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            )}
          </label>
        </div>
      ) : (
        onToggleExpanded && (
          <div className="flex justify-center px-2 pt-2">
            <button
              type="button"
              onClick={onToggleExpanded}
              className="rounded-xl p-2.5 text-muted hover:bg-foreground/5 hover:text-foreground"
              aria-label="Search menu"
              title="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {filtered.map((group) => (
          <div key={group.id} className="mb-3">
            {group.label && showLabels && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {group.label}
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      !showLabels && "justify-center px-0",
                      active
                        ? "bg-primary/15 text-foreground"
                        : "text-muted hover:bg-foreground/5 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px] shrink-0"
                      strokeWidth={active ? 2.25 : 1.75}
                    />
                    {showLabels && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div
        ref={userMenuRef}
        className="relative z-40 shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-2"
      >
        {!userMenuOpen && (
          <div className={cn(!showLabels && "flex justify-center")}>
            <PlatformNotificationsBell compact={!showLabels} />
          </div>
        )}

        {userMenuOpen && (
          <div className="mb-1 overflow-hidden rounded-xl border border-[var(--color-border)] bg-background shadow-lg">
            <Link
              href="/settings"
              onClick={() => {
                setUserMenuOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-foreground/5"
            >
              <Settings className="h-4 w-4 text-muted" />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-foreground/5"
            >
              <LogOut className="h-4 w-4 text-muted" />
              Log out
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setUserMenuOpen((o) => !o)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-foreground/5",
            !showLabels && "justify-center px-0",
          )}
        >
          <UserAvatar name={displayName} src={avatarUrl} size="sm" />
          {showLabels && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {displayName}
                </span>
                {email && (
                  <span className="block truncate text-[11px] text-muted">
                    {email}
                  </span>
                )}
              </span>
              <ChevronUp
                className={cn(
                  "h-4 w-4 shrink-0 text-muted transition-transform",
                  !userMenuOpen && "rotate-180",
                )}
              />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      if (raw === "0") setExpanded(false);
      if (raw === "1") setExpanded(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.body.dataset.sidebarExpanded = expanded ? "1" : "0";
    return () => {
      delete document.body.dataset.sidebarExpanded;
    };
  }, [expanded]);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_EXPANDED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <aside
      className={cn(
        "app-sidebar fixed bottom-3 left-3 top-3 z-50 hidden md:block",
        "transition-[width] duration-300 ease-out",
        expanded ? "w-[16.5rem]" : "w-[4.5rem]",
      )}
    >
      <SidebarShell
        expanded={expanded}
        onToggleExpanded={toggle}
        pathname={pathname}
      />
    </aside>
  );
}

function MobileMenuDrawer({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 top-0 w-[min(100%,20rem)] animate-in slide-in-from-left duration-200">
        <SidebarShell
          expanded
          pathname={pathname}
          mobile
          onClose={onClose}
          onNavigate={onClose}
        />
      </div>
    </div>
  );
}

function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user } = useAuthStore();
  const avatarUrl = user?.avatarUrl ?? null;
  const displayName = user?.displayName;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 backdrop-blur-xl md:hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-xl p-2 text-foreground hover:bg-foreground/5"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center">
          <Logo compact className="text-lg font-bold tracking-tight" />
        </Link>
      </div>
      <Link
        href="/settings"
        className="flex min-w-0 max-w-[50%] items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-foreground/5"
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const hideMobileHeader = isMt5Route(pathname);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!isAuthenticated) {
    return <PublicHeader />;
  }

  return (
    <>
      <DesktopSidebar pathname={pathname} />
      {!hideMobileHeader && (
        <MobileHeader onOpenMenu={() => setMobileOpen(true)} />
      )}
      <MobileMenuDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        pathname={pathname}
      />
      {!hideMobileHeader && (
        <MobileBottomNav onOpenFullMenu={() => setMobileOpen(true)} />
      )}
    </>
  );
}

export function MainContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const pathname = usePathname();
  const tradingDesk = isAuthenticated && isMt5Route(pathname);

  return (
    <main
      className={cn(
        "app-main flex-1 transition-[padding] duration-300",
        isAuthenticated &&
          !tradingDesk &&
          "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-0",
        isAuthenticated && "md:pl-[calc(4.5rem+1.5rem)]",
        tradingDesk && "flex h-dvh min-h-0 flex-col overflow-hidden",
      )}
    >
      {children}
    </main>
  );
}
