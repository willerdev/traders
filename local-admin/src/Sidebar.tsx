import { useEffect, useRef, useState } from "react";

export type Tab =
  | "users"
  | "transactions"
  | "kyc"
  | "payouts"
  | "platform";

type NavItem = { id: Tab; label: string; icon: keyof typeof icons };

/** Investment-only admin surface. */
export const ADMIN_TABS: Tab[] = [
  "platform",
  "users",
  "payouts",
  "transactions",
  "kyc",
];

export function isAdminTab(value: string): value is Tab {
  return (ADMIN_TABS as string[]).includes(value);
}

export type AdminPermissions = {
  fullAdmin: boolean;
  hubAccess: boolean;
  kyc: boolean;
  payout: boolean;
  tpClaim: boolean;
  setup: boolean;
  managePermissions: boolean;
  /** When false, hide credit wallet / whitelist / real NOWPayments balance / yield save. */
  sensitiveFinance?: boolean;
};

/**
 * Restricted finance viewers — full admin tabs, but sensitive ops stay hidden.
 * Remove an email here to restore full finance UI for that account.
 */
export const RESTRICTED_FINANCE_ADMIN_EMAILS = [
  "viewer@traderrank.pro",
] as const;

export const STATIC_NOWPAYMENTS_BALANCE_LABEL = "21,500 Usdt";

export function canSeeSensitiveFinance(opts: {
  email?: string | null;
  permissions?: AdminPermissions | null;
}): boolean {
  if (opts.permissions?.sensitiveFinance === false) return false;
  const email = opts.email?.trim().toLowerCase() ?? "";
  if (
    email &&
    (RESTRICTED_FINANCE_ADMIN_EMAILS as readonly string[]).includes(email)
  ) {
    return false;
  }
  return true;
}

export function tabsForPermissions(permissions: AdminPermissions | null): Tab[] {
  if (!permissions) return [];
  if (permissions.fullAdmin) return ADMIN_TABS;
  const allowed = new Set<Tab>(["platform"]);
  if (permissions.kyc) allowed.add("kyc");
  if (permissions.payout) {
    allowed.add("payouts");
    allowed.add("transactions");
  }
  return ADMIN_TABS.filter((t) => allowed.has(t));
}

export function defaultTabForPermissions(permissions: AdminPermissions | null): Tab {
  const tabs = tabsForPermissions(permissions);
  return tabs[0] ?? "platform";
}

export function staffRoleSummary(permissions: AdminPermissions | null): string {
  if (!permissions || permissions.fullAdmin) return "";
  const roles: string[] = [];
  if (permissions.kyc) roles.push("KYC");
  if (permissions.payout) roles.push("Payouts");
  return roles.join(" · ");
}

export function resolveTabForPermissions(
  permissions: AdminPermissions | null,
  preferred?: Tab,
): Tab {
  const tabs = tabsForPermissions(permissions);
  if (tabs.length === 0) return preferred ?? "platform";
  if (preferred && tabs.includes(preferred)) return preferred;
  return defaultTabForPermissions(permissions);
}

const NAV_ITEMS: NavItem[] = [
  { id: "platform", label: "Investor & depositor", icon: "forecast" },
  { id: "users", label: "Users", icon: "users" },
  { id: "payouts", label: "Payouts", icon: "payouts" },
  { id: "transactions", label: "Transactions", icon: "transactions" },
  { id: "kyc", label: "KYC", icon: "kyc" },
];

const icons = {
  forecast: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 19V5" strokeLinecap="round" />
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M8 16v-4M12 16V8M16 16v-6" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <path d="M16 7.5a3 3 0 1 1 0 6" strokeLinecap="round" />
      <path d="M21 20c0-2.5-1.8-4.6-4.2-5.2" strokeLinecap="round" />
    </svg>
  ),
  transactions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 7h12" strokeLinecap="round" />
      <path d="M14 4l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 17H8" strokeLinecap="round" />
      <path d="M10 14l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  kyc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <path d="M14 10h4M14 14h3" strokeLinecap="round" />
    </svg>
  ),
  payouts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" strokeLinecap="round" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 12a8 8 0 0 1 13.7-5.7" strokeLinecap="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7" strokeLinecap="round" />
      <path d="M4 20v-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2" strokeLinejoin="round" />
      <path d="M14 12H4m0 0l3-3m-3 3l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function avatarLetter(email: string) {
  const ch = email.trim()[0];
  return ch ? ch.toUpperCase() : "A";
}

function truncateEmail(email: string, max = 22) {
  if (email.length <= max) return email;
  const at = email.indexOf("@");
  if (at <= 0) return `${email.slice(0, max - 1)}…`;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const room = max - domain.length - 1;
  if (room < 2) return `${email.slice(0, max - 1)}…`;
  return `${local.slice(0, room)}…${domain}`;
}

type SidebarProps = {
  tab: Tab;
  allowedTabs: Tab[];
  sessionLoading?: boolean;
  staffSummary?: string;
  onTabChange: (tab: Tab) => void;
  adminEmail: string;
  onRefresh: () => void;
  onLogout: () => void;
};

export function Sidebar({
  tab,
  allowedTabs,
  sessionLoading = false,
  staffSummary = "",
  onTabChange,
  adminEmail,
  onRefresh,
  onLogout,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const visibleItems = NAV_ITEMS.filter((item) => allowedTabs.includes(item.id));

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" aria-hidden>
          TR
        </div>
        <span className="sidebar-brand-name">TraderRank</span>
        <span className="sidebar-brand-badge">
          {staffSummary ? "Staff" : "Invest"}
        </span>
      </div>

      <nav className="sidebar-nav" aria-label="Investment admin">
        {sessionLoading ? (
          <p className="sidebar-nav-empty muted">Loading…</p>
        ) : (
          visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-link${tab === item.id ? " active" : ""}`}
              onClick={() => onTabChange(item.id)}
            >
              <span className="sidebar-link-icon">{icons[item.icon]}</span>
              <span>{item.label}</span>
            </button>
          ))
        )}
      </nav>

      <div className="sidebar-footer" ref={menuRef}>
        <button
          type="button"
          className="sidebar-user"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
        >
          <span className="sidebar-avatar">{avatarLetter(adminEmail)}</span>
          <span className="sidebar-user-meta">
            <span className="sidebar-user-email">{truncateEmail(adminEmail)}</span>
            {staffSummary ? (
              <span className="sidebar-user-role">{staffSummary}</span>
            ) : (
              <span className="sidebar-user-role">Investment admin</span>
            )}
          </span>
        </button>
        {menuOpen && (
          <div className="sidebar-menu">
            <button type="button" onClick={onRefresh}>
              <span className="sidebar-link-icon">{icons.refresh}</span>
              Refresh
            </button>
            <button type="button" className="danger" onClick={onLogout}>
              <span className="sidebar-link-icon">{icons.logout}</span>
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
