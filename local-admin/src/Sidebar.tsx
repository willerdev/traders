import { useEffect, useRef, useState } from "react";

export type Tab =
  | "overview"
  | "paymentForecast"
  | "users"
  | "messages"
  | "signals"
  | "kyc"
  | "payouts"
  | "tpClaims"
  | "promos"
  | "marketing"
  | "referrals"
  | "mt5Copy"
  | "hub";

type NavItem = { id: Tab; label: string; icon: keyof typeof icons };

export const ADMIN_TABS: Tab[] = [
  "overview",
  "paymentForecast",
  "users",
  "messages",
  "signals",
  "kyc",
  "payouts",
  "tpClaims",
  "promos",
  "marketing",
  "referrals",
  "mt5Copy",
  "hub",
];

export function isAdminTab(value: string): value is Tab {
  return (ADMIN_TABS as string[]).includes(value);
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "paymentForecast", label: "Payment forecast", icon: "forecast" },
  { id: "users", label: "Users", icon: "users" },
  { id: "messages", label: "Messages", icon: "messages" },
  { id: "signals", label: "Setups", icon: "setups" },
  { id: "kyc", label: "KYC", icon: "kyc" },
  { id: "payouts", label: "Payouts", icon: "payouts" },
  { id: "tpClaims", label: "TP Claims", icon: "tpClaims" },
  { id: "promos", label: "Promo codes", icon: "promos" },
  { id: "marketing", label: "Email marketing", icon: "marketing" },
  { id: "referrals", label: "Referrals", icon: "referrals" },
  { id: "mt5Copy", label: "MT5 Copy", icon: "mt5Copy" },
  { id: "hub", label: "Hub MT5", icon: "hub" },
];

const icons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 3v18h18" strokeLinecap="round" />
      <path d="M7 16l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
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
  messages: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
    </svg>
  ),
  setups: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 19V5" strokeLinecap="round" />
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  kyc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l7 4v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V7l7-4z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  payouts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" strokeLinecap="round" />
      <path d="M7 15h4" strokeLinecap="round" />
    </svg>
  ),
  tpClaims: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  promos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 9l8-5 8 5v6l-8 5-8-5V9z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  marketing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 8l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  ),
  referrals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M20 12v8H4v-8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="8" width="20" height="4" rx="1" />
      <path d="M12 8v12" strokeLinecap="round" />
      <path d="M12 8c-2.5 0-4.5-1.3-4.5-3S9.5 3.5 12 8zM12 8c2.5 0 4.5-1.3 4.5-3S14.5 3.5 12 8z" strokeLinejoin="round" />
    </svg>
  ),
  hub: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  mt5Copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 7h12M8 12h12M8 17h8" strokeLinecap="round" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" strokeLinecap="round" />
      <path d="M3 5v14" strokeLinecap="round" />
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
  onTabChange: (tab: Tab) => void;
  adminEmail: string;
  onRefresh: () => void;
  onLogout: () => void;
};

export function Sidebar({
  tab,
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

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" aria-hidden>
          TR
        </div>
        <span className="sidebar-brand-name">TraderRank</span>
        <span className="sidebar-brand-badge">Admin</span>
      </div>

      <nav className="sidebar-nav" aria-label="Admin navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-nav-item${tab === item.id ? " active" : ""}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="sidebar-nav-icon">{icons[item.icon]}</span>
            <span className="sidebar-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer" ref={menuRef}>
        <button
          type="button"
          className="sidebar-user"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className="sidebar-avatar">{avatarLetter(adminEmail)}</span>
          <span className="sidebar-user-email" title={adminEmail}>
            {truncateEmail(adminEmail)}
          </span>
          <span className="sidebar-user-menu" aria-hidden>
            ···
          </span>
        </button>

        {menuOpen && (
          <div className="sidebar-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onRefresh();
              }}
            >
              <span className="sidebar-menu-icon">{icons.refresh}</span>
              Refresh data
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            >
              <span className="sidebar-menu-icon">{icons.logout}</span>
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
