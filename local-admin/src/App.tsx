import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import {
  api,
  getToken,
  setToken,
  getAdminEmail,
  setAdminEmail,
  hubAccessFromLoginUser,
  type AdminSession,
  type KycRow,
  type PayoutRow,
  type SignalRow,
  type UserRow,
  type PromoCodeRow,
  type PromoUsageRow,
  type HubSenderReport,
  type MetaApiAccountsResult,
  type MetaApiTerminalState,
  type TpClaimRow,
  type MessageThreadSummary,
  type DirectMessage,
  type NowPaymentsWalletSummary,
  type CustodyDepositRow,
  type CustodyDepositCreated,
  type PaymentForecast,
  type LivePresenceSnapshot,
  type CopyTradingDashboard,
  type MarketingSchedule,
  type MarketingEmailRow,
  type ReferralSettings,
  type ReferrerRow,
  type ReferralSettlementRow,
  type Mt5SyncAdminOverview,
  type InstantWithdrawRow,
} from "./api";
import { AdminImage } from "./AdminImage";
import {
  Sidebar,
  type Tab,
  isAdminTab,
  tabsForPermissions,
  resolveTabForPermissions,
  staffRoleSummary,
  canSeeSensitiveFinance,
  STATIC_NOWPAYMENTS_BALANCE_LABEL,
  type AdminPermissions,
} from "./Sidebar";
import { UserDetailModal } from "./UserDetailModal";
import { InvestorDepositorPlatform } from "./InvestorDepositorPlatform";
import { TransactionsPanel } from "./TransactionsPanel";

function badgeClass(status: string) {
  return `badge ${status.toLowerCase()}`;
}

function fmtMoney(n: number | string) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function payoutSourceLabel(p: PayoutRow) {
  switch (p.source) {
    case "DEPOSITOR":
      return "Wallet withdrawal";
    case "PROFIT_SHARE":
      return "Profit share";
    case "TP_REWARD":
      return p.notes?.replace(/^TP reward — /, "") ?? "TP reward";
    default:
      return "Weekly tier";
  }
}

function payoutNeedsDestination(p: PayoutRow) {
  return p.source === "DEPOSITOR";
}

function canApprovePayout(
  p: PayoutRow,
  payoutGatewayReady = true,
  externalSettlement = false,
) {
  if (p.user.kyc?.status !== "APPROVED") return false;
  if (payoutNeedsDestination(p) && !p.walletAddress?.trim()) return false;
  if (payoutNeedsDestination(p) && !payoutGatewayReady && !externalSettlement) {
    return false;
  }
  return true;
}

function canRefundPayout(p: PayoutRow) {
  return p.source === "DEPOSITOR" && p.status !== "REJECTED";
}

function fmtPercent(value: number | null | undefined, asFraction = false) {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = asFraction ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

function SkeletonLine({
  width = "100%",
  className = "skeleton-line",
}: {
  width?: string;
  className?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ width }} />;
}

function Mt5CopyAccountSkeleton() {
  return (
    <>
      <div className="cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <SkeletonLine width="45%" />
            <div style={{ marginTop: "0.75rem" }}>
              <SkeletonLine width="70%" className="skeleton-line-lg" />
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: "1.5rem" }}>Running trades</h3>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Volume</th>
            <th>Open</th>
            <th>Current</th>
            <th>S/L</th>
            <th>T/P</th>
            <th>P/L</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 4 }).map((_, i) => (
            <tr key={i} className="skeleton-table-row">
              {Array.from({ length: 8 }).map((__, j) => (
                <td key={j}>
                  <SkeletonLine width={j === 0 ? "70%" : "55%"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Mt5CopySettingsSkeleton() {
  return (
    <>
      <div className="kyc-card" style={{ marginBottom: "1rem" }}>
        <SkeletonLine width="30%" className="skeleton-line-lg" />
        <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
          <SkeletonLine width="100%" />
          <SkeletonLine width="100%" />
          <SkeletonLine width="8rem" />
        </div>
      </div>
      <div className="kyc-card" style={{ marginBottom: "1rem" }}>
        <SkeletonLine width="35%" className="skeleton-line-lg" />
        <div style={{ marginTop: "1rem" }}>
          <SkeletonLine width="100%" />
        </div>
        <table style={{ marginTop: "1rem" }}>
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="skeleton-table-row">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j}>
                    <SkeletonLine width="60%" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SkeletonLine width="40%" className="skeleton-line-lg" />
      <table style={{ marginTop: "0.75rem" }}>
        <tbody>
          {Array.from({ length: 4 }).map((_, i) => (
            <tr key={i} className="skeleton-table-row">
              {Array.from({ length: 9 }).map((__, j) => (
                <td key={j}>
                  <SkeletonLine width="55%" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function needsPaymentReview(u: UserRow) {
  return u.status === "PENDING_PAYMENT";
}

function paymentReviewLabel(u: UserRow) {
  if (u.registrationPaid) return "Renew weekly access";
  return "Review payment";
}

function isAuthFailure(message: string) {
  return /unauthorized|forbidden|jwt|token expired|invalid token/i.test(message);
}

function formatEmailFlags(reasons: string[]) {
  return reasons.map((reason) => reason.replace(/_/g, " ")).join(", ");
}

function isBanCandidate(user: UserRow) {
  return (
    Boolean(user.emailAssessment?.suspicious) &&
    user.status !== "BANNED" &&
    user.role !== "ADMIN"
  );
}

function depositProgressLabel(d: CustodyDepositRow) {
  if (d.status === "CONFIRMED") return "Complete";
  if (d.status === "FAILED" || d.status === "EXPIRED") return d.status;
  const live = d.liveStatus?.toLowerCase() ?? "";
  if (live === "confirming") return "Confirming on chain";
  if (live === "partially_paid") return "Partial payment received";
  if (live === "waiting") return "Waiting for transfer";
  return d.liveStatus || "Waiting for payment";
}

function tabFromHash(): Tab {
  const hash = window.location.hash.replace(/^#/, "");
  return isAdminTab(hash) ? hash : "platform";
}

const USERS_PAGE_SIZE = 50;
const SIGNAL_PAGE_SIZE = 50;
const KYC_PAGE_SIZE = 50;

const SETUP_STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "PENDING", label: "Pending" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REJECTED_DUPLICATE", label: "Rejected dup" },
];

function setupCanSetLimit(signal: SignalRow) {
  if (signal.status !== "OPEN") return false;
  if (signal.trade?.closedAt || signal.trade?.activatedAt) return false;
  return true;
}

function setupCanMirrorToCopy(signal: SignalRow) {
  if (signal.status !== "OPEN") return false;
  if (signal.trade?.closedAt) return false;
  return true;
}

function setupNeedsLimit(signal: SignalRow) {
  return (
    setupCanSetLimit(signal) && !signal.hubQueued && !signal.metaApiQueued
  );
}

function setupProgressLabel(signal: SignalRow) {
  if (signal.status !== "OPEN") return signal.status.replace(/_/g, " ");
  if (signal.trade?.closedAt) return "Closed";
  if (signal.trade?.activatedAt) return "Running";
  if (signal.hubQueued || signal.metaApiQueued) return "Limit queued";
  return "Submitted — limit not set";
}

function purposeLabel(purpose: string) {
  if (purpose === "registration") return "Registration";
  if (purpose === "setup_plan_premium") return "Setup plan — Premium";
  if (purpose === "setup_plan_pro") return "Setup plan — Pro";
  return purpose.replace(/_/g, " ");
}

function isErrorMessage(msg: string) {
  return /fail|error|unreachable|unauthorized|forbidden|cannot get/i.test(msg);
}

type PaymentProjectionOverview = {
  totalTraders: number;
  paidRegistrationCount: number;
  unpaidRegistrationCount: number;
  registrationFeeUsdt: number;
  projectedRegistrationRevenueUsdt: number;
  activeSetupPlans?: { premium: number; pro: number };
  setupRenewalsDue30d?: {
    premium: number;
    pro: number;
    total: number;
    amountUsdt: number;
  };
  projectedNextSetupRenewalRevenueUsdt?: number;
  projectedCombinedNextRevenueUsdt?: number;
};

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [email, setEmail] = useState(getAdminEmail() ?? "");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginStep, setLoginStep] = useState<"credentials" | "otp">("credentials");
  const [loginSessionId, setLoginSessionId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(getToken()));
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [paymentForecast, setPaymentForecast] = useState<PaymentForecast | null>(null);
  const [livePresence, setLivePresence] = useState<LivePresenceSnapshot | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [signalPage, setSignalPage] = useState(0);
  const [setupStatusFilter, setSetupStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [setLimitLoadingId, setSetLimitLoadingId] = useState<string | null>(null);
  const [copyMirrorLoadingId, setCopyMirrorLoadingId] = useState<string | null>(null);
  const [tp1ApproveLoadingId, setTp1ApproveLoadingId] = useState<string | null>(null);
  const [kycQueue, setKycQueue] = useState<KycRow[]>([]);
  const [kycCount, setKycCount] = useState(0);
  const [kycPage, setKycPage] = useState(0);
  const [kycStatusFilter, setKycStatusFilter] = useState<
    "all" | "PENDING" | "APPROVED" | "REJECTED"
  >("all");
  const [kycCounts, setKycCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [weeklyTierPayoutsEnabled, setWeeklyTierPayoutsEnabled] = useState(false);
  const [weeklyTierSaving, setWeeklyTierSaving] = useState(false);
  const [npWallet, setNpWallet] = useState<NowPaymentsWalletSummary | null>(null);
  const [custodyDeposits, setCustodyDeposits] = useState<CustodyDepositRow[]>([]);
  const [depositPendingCount, setDepositPendingCount] = useState(0);
  const [depositConfirmedTotal, setDepositConfirmedTotal] = useState(0);
  const [depositSyncLoading, setDepositSyncLoading] = useState(false);
  const [watchingDepositId, setWatchingDepositId] = useState<string | null>(null);
  const [expandedDepositId, setExpandedDepositId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("100");
  const [depositNetwork, setDepositNetwork] = useState("TRC20");
  const [activeDeposit, setActiveDeposit] = useState<CustodyDepositCreated | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [verifyPayoutId, setVerifyPayoutId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [approvePayoutModal, setApprovePayoutModal] = useState<PayoutRow | null>(null);
  const [approvePayoutLoading, setApprovePayoutLoading] = useState(false);
  const [approvePayoutError, setApprovePayoutError] = useState("");
  const [approvePayoutExternal, setApprovePayoutExternal] = useState(false);
  const [refundPayoutModal, setRefundPayoutModal] = useState<PayoutRow | null>(null);
  const [refundPayoutReason, setRefundPayoutReason] = useState("");
  const [refundPayoutLoading, setRefundPayoutLoading] = useState(false);
  const [refundPayoutError, setRefundPayoutError] = useState("");
  const [creditWalletEmail, setCreditWalletEmail] = useState("");
  const [creditWalletAmount, setCreditWalletAmount] = useState("");
  const [creditWalletNote, setCreditWalletNote] = useState("");
  const [creditWalletLoading, setCreditWalletLoading] = useState(false);
  const [instantWithdrawUsers, setInstantWithdrawUsers] = useState<
    InstantWithdrawRow[]
  >([]);
  const [instantWithdrawEmail, setInstantWithdrawEmail] = useState("");
  const [instantWithdrawSaving, setInstantWithdrawSaving] = useState(false);
  const [instantWithdrawRemovingId, setInstantWithdrawRemovingId] =
    useState<string | null>(null);
  const [tpClaims, setTpClaims] = useState<TpClaimRow[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCodeRow[]>([]);
  const [promoUsage, setPromoUsage] = useState<PromoUsageRow[]>([]);
  const [hubReport, setHubReport] = useState<HubSenderReport | null>(null);
  const [metaApiAccounts, setMetaApiAccounts] =
    useState<MetaApiAccountsResult | null>(null);
  const [metaApiLoadError, setMetaApiLoadError] = useState<string | null>(null);
  const [metaApiTerminal, setMetaApiTerminal] =
    useState<MetaApiTerminalState | null>(null);
  const [metaApiTerminalLoading, setMetaApiTerminalLoading] = useState(false);
  const [copyDashboard, setCopyDashboard] = useState<CopyTradingDashboard | null>(null);
  const [copyPoolAddUserId, setCopyPoolAddUserId] = useState("");
  const [copyPoolLoading, setCopyPoolLoading] = useState(false);
  const [copyRiskAmount, setCopyRiskAmount] = useState("");
  const [copyNotifyEmail, setCopyNotifyEmail] = useState("");
  const [copyUseTwoToOneRr, setCopyUseTwoToOneRr] = useState(true);
  const [copyAutoBreakeven, setCopyAutoBreakeven] = useState(true);
  const [copyEmailAlerts, setCopyEmailAlerts] = useState(true);
  const [copyTradesEnabled, setCopyTradesEnabled] = useState(true);
  const [copyPauseSaving, setCopyPauseSaving] = useState(false);
  const [copySettingsSaving, setCopySettingsSaving] = useState(false);
  const [copySubTab, setCopySubTab] = useState<"account" | "settings">("account");
  const [copyDashboardLoading, setCopyDashboardLoading] = useState(false);
  const [copyTerminalLoading, setCopyTerminalLoading] = useState(false);
  const copyLoadPromiseRef = useRef<Promise<void> | null>(null);
  const copyPrefetchedRef = useRef(false);
  const [mt5SyncOverview, setMt5SyncOverview] = useState<Mt5SyncAdminOverview | null>(null);
  const [mt5SyncFeeInput, setMt5SyncFeeInput] = useState("5");
  const [mt5SyncSaving, setMt5SyncSaving] = useState(false);
  const [selectedMetaApiAccountId, setSelectedMetaApiAccountId] = useState<
    string | null
  >(null);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoSingleUse, setNewPromoSingleUse] = useState(false);
  const [bulkPromoCount, setBulkPromoCount] = useState("5");
  const [bulkPromoPrefix, setBulkPromoPrefix] = useState("offline");
  const [bulkPromoDays, setBulkPromoDays] = useState("30");
  const [bulkPromoLoading, setBulkPromoLoading] = useState(false);
  const [newPromoDays, setNewPromoDays] = useState("7");
  const [newPromoPercent, setNewPromoPercent] = useState("100");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [tpRejectReason, setTpRejectReason] = useState<Record<string, string>>({});
  const [kycActionUserId, setKycActionUserId] = useState<string | null>(null);
  const [paymentModalUser, setPaymentModalUser] = useState<UserRow | null>(null);
  const [userDetailId, setUserDetailId] = useState<string | null>(null);
  const [paymentDenyReason, setPaymentDenyReason] = useState("");
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [messageThreads, setMessageThreads] = useState<MessageThreadSummary[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<DirectMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatModalUser, setChatModalUser] = useState<UserRow | null>(null);
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [userPage, setUserPage] = useState(0);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [banLoadingId, setBanLoadingId] = useState<string | null>(null);
  const [bulkBanLoading, setBulkBanLoading] = useState(false);
  const [marketingSchedule, setMarketingSchedule] =
    useState<MarketingSchedule | null>(null);
  const [marketingHistory, setMarketingHistory] = useState<MarketingEmailRow[]>([]);
  const [marketingHistoryCount, setMarketingHistoryCount] = useState(0);
  const [marketingAudienceView, setMarketingAudienceView] = useState<
    "unpaid_registration" | "inactive_trader" | "kyc_incomplete"
  >("unpaid_registration");
  const [marketingRunLoading, setMarketingRunLoading] = useState(false);
  const [marketingTestLoading, setMarketingTestLoading] = useState(false);
  const [marketingTestEmail, setMarketingTestEmail] = useState("willeratmit12@gmail.com");
  const [referralSettings, setReferralSettings] =
    useState<ReferralSettings | null>(null);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [referralSettlements, setReferralSettlements] = useState<
    ReferralSettlementRow[]
  >([]);
  const [refKycAmount, setRefKycAmount] = useState("");
  const [refPaidAmount, setRefPaidAmount] = useState("");
  const [refSaving, setRefSaving] = useState(false);
  const [expandedReferrerId, setExpandedReferrerId] = useState<string | null>(null);
  const [settlingReferrerId, setSettlingReferrerId] = useState<string | null>(null);

  useEffect(() => {
    const next = `#${tab}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [tab]);

  const allowedTabs = tabsForPermissions(adminSession?.permissions ?? null);
  const isFullAdmin = Boolean(adminSession?.permissions.fullAdmin);
  const canManageSetups =
    isFullAdmin || Boolean(adminSession?.permissions.setup);
  const showSensitiveFinance = canSeeSensitiveFinance({
    email: adminSession?.email,
    permissions: adminSession?.permissions ?? null,
  });
  const staffSummary = staffRoleSummary(adminSession?.permissions ?? null);

  const loadAdminSession = useCallback(async () => {
    const session = await api.adminSession();
    setAdminSession(session);
    setTab((current) =>
      resolveTabForPermissions(session.permissions, current),
    );
    return session;
  }, []);

  useEffect(() => {
    if (!authed || !getToken()) {
      setSessionLoading(false);
      setAdminSession(null);
      return;
    }

    let cancelled = false;
    setSessionLoading(true);
    void loadAdminSession()
      .catch(() => {
        if (!cancelled) {
          setAuthed(false);
          setAdminSession(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authed, loadAdminSession]);

  useEffect(() => {
    if (!authed) return;
    const refreshSession = () => {
      void loadAdminSession().catch(() => {
        /* keep current session on background refresh failure */
      });
    };
    window.addEventListener("focus", refreshSession);
    return () => window.removeEventListener("focus", refreshSession);
  }, [authed, loadAdminSession]);

  useEffect(() => {
    if (!adminSession) return;
    const onHash = () => {
      const hashTab = tabFromHash();
      setTab(resolveTabForPermissions(adminSession.permissions, hashTab));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [adminSession]);

  const changeTab = useCallback((next: Tab) => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(next)) return;
    setTab(next);
    setMessage("");
  }, [allowedTabs]);

  const refreshCustodyDeposits = useCallback(async (sync = true) => {
    const res = await api.custodyDeposits(20, sync);
    setCustodyDeposits(res.items);
    setDepositPendingCount(res.pendingCount);
    setDepositConfirmedTotal(res.confirmedTotalUsdt);
    return res;
  }, []);

  const loadMetaApiTerminal = useCallback(async (accountId?: string | null) => {
    setMetaApiTerminalLoading(true);
    try {
      const terminal = await api.metaApiTerminal(accountId ?? undefined);
      setMetaApiTerminal(terminal);
      if (terminal.accountId) {
        setSelectedMetaApiAccountId(terminal.accountId);
      }
    } catch (err) {
      setMetaApiTerminal({
        configured: true,
        defaultAccountId: null,
        accountId: accountId ?? null,
        account: null,
        information: null,
        positions: [],
        error:
          err instanceof Error ? err.message : "Failed to load MetaAPI terminal",
      });
    } finally {
      setMetaApiTerminalLoading(false);
    }
  }, []);

  const loadCopyDashboard = useCallback(
    async (options?: { fastOnly?: boolean; terminalOnly?: boolean }) => {
      const terminalOnly = options?.terminalOnly === true;
      const fastOnly = options?.fastOnly === true;

      if (!terminalOnly) {
        setCopyDashboardLoading(true);
        try {
          const fast = await api.metaApiCopyDashboard({ includeTerminal: false });
          setCopyDashboard((prev) => ({
            ...fast,
            terminal: prev?.terminal ?? null,
            stats: prev?.terminal ? prev.stats : fast.stats,
          }));
          setCopyRiskAmount(
            String(fast.copyRiskPercent ?? fast.riskPercent ?? 5),
          );
          setCopyNotifyEmail(fast.copyNotifyEmail ?? "willeratmit12@gmail.com");
        setCopyUseTwoToOneRr(fast.copyUseTwoToOneRr ?? true);
        setCopyAutoBreakeven(fast.copyAutoBreakevenEnabled ?? true);
        setCopyEmailAlerts(fast.copyEmailAlertsEnabled ?? true);
        if (typeof fast.copyTradesEnabled === "boolean") {
          setCopyTradesEnabled(fast.copyTradesEnabled);
        }
        } catch (err) {
          setMessage(
            err instanceof Error ? err.message : "Failed to load copy pool",
          );
        } finally {
          setCopyDashboardLoading(false);
        }
      }

      if (fastOnly) return;

      setCopyTerminalLoading(true);
      try {
        const full = await api.metaApiCopyDashboard({ includeTerminal: true });
        setCopyDashboard(full);
        if (typeof full.copyTradesEnabled === "boolean") {
          setCopyTradesEnabled(full.copyTradesEnabled);
        }
      } catch {
        /* keep fast snapshot if live account sync fails */
      } finally {
        setCopyTerminalLoading(false);
      }
    },
    [],
  );

  const prefetchCopyDashboard = useCallback(async () => {
    if (copyLoadPromiseRef.current) return copyLoadPromiseRef.current;

    const run = (async () => {
      await loadCopyDashboard({ fastOnly: true });
      void loadCopyDashboard({ terminalOnly: true });
    })();

    copyLoadPromiseRef.current = run;
    try {
      await run;
    } finally {
      copyLoadPromiseRef.current = null;
    }
  }, [loadCopyDashboard]);

  const loadUsersPage = useCallback(
    async (page: number, search: string, suspicious = suspiciousOnly) => {
      const res = await api.users({
        offset: page * USERS_PAGE_SIZE,
        limit: USERS_PAGE_SIZE,
        suspiciousOnly: suspicious,
        search: search.trim() || undefined,
      });
      setUsers(res.items);
      setUserCount(res.count);
      setSelectedUserIds([]);
      setUserPage(page);
      setUserSearch(search.trim());
    },
    [suspiciousOnly],
  );

  const loadTab = useCallback(async (active: Tab) => {
    setLoading(true);
    setMessage("");
    try {
      if (active === "users") {
        await loadUsersPage(userPage, userSearch);
      } else if (active === "transactions") {
        /* TransactionsPanel loads its own data */
      } else if (active === "kyc") {
        const res = await api.kycList(
          kycPage * KYC_PAGE_SIZE,
          kycStatusFilter === "all" ? undefined : kycStatusFilter,
        );
        setKycQueue(res.items);
        setKycCount(res.count);
        setKycCounts(res.counts);
      } else if (active === "payouts") {
        const [
          payoutsRes,
          walletRes,
          depositsRes,
          tierSettingsRes,
          instantRes,
        ] = await Promise.allSettled([
          api.payouts(),
          api.nowPaymentsWallet(),
          api.custodyDeposits(20, false),
          api.weeklyTierPayoutSettings(),
          api.instantWithdrawList(),
        ]);
        if (instantRes.status === "fulfilled") {
          setInstantWithdrawUsers(instantRes.value.items);
        } else {
          setInstantWithdrawUsers([]);
        }

        if (payoutsRes.status === "fulfilled") {
          setPayouts(payoutsRes.value.items);
        } else {
          throw payoutsRes.reason;
        }

        if (tierSettingsRes.status === "fulfilled") {
          setWeeklyTierPayoutsEnabled(
            tierSettingsRes.value.weeklyTierPayoutsEnabled,
          );
        }

        if (walletRes.status === "fulfilled") {
          setNpWallet(walletRes.value);
        } else {
          const errMsg =
            walletRes.reason instanceof Error
              ? walletRes.reason.message
              : "Failed to load custody wallet";
          setNpWallet({
            configured: false,
            usdtBalance: 0,
            pendingCryptoPayoutTotal: 0,
            pendingCryptoPayoutCount: 0,
            message:
              errMsg.includes("Cannot GET") || errMsg.includes("404")
                ? "Custody wallet API is not deployed yet — redeploy traders-api on Render, then refresh."
                : errMsg,
          });
        }

        if (depositsRes.status === "fulfilled") {
          const dep = depositsRes.value;
          setCustodyDeposits(dep.items);
          setDepositPendingCount(dep.pendingCount);
          setDepositConfirmedTotal(dep.confirmedTotalUsdt);
        } else {
          setCustodyDeposits([]);
          setDepositPendingCount(0);
          setDepositConfirmedTotal(0);
        }
      } else if (active === "platform") {
        /* InvestorDepositorPlatform loads its own data */
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to load data";
      setMessage(errMsg);
      if (isAuthFailure(errMsg) || !getToken()) {
        setAuthed(false);
        setLoginStep("credentials");
        setLoginSessionId("");
        sessionStorage.removeItem("admin-login-session");
      }
    } finally {
      setLoading(false);
    }
  }, [kycStatusFilter, kycPage, loadUsersPage, userPage, userSearch]);

  useEffect(() => {
    if (tab !== "payouts" || !authed) return;
    const hasPending =
      depositPendingCount > 0 ||
      watchingDepositId != null ||
      custodyDeposits.some((d) => d?.status === "PENDING");
    if (!hasPending) return;

    const tick = () => {
      void refreshCustodyDeposits(true).then((res) => {
        if (!res || !watchingDepositId) return;
        const watched = res.items.find((d) => d.id === watchingDepositId);
        if (watched?.status === "CONFIRMED") {
          setMessage(
            `Custody deposit confirmed — ${fmtMoney(watched.amount)} added to NOWPayments balance.`,
          );
          setWatchingDepositId(null);
          setActiveDeposit(null);
          void api.nowPaymentsWallet().then(setNpWallet).catch(() => {});
        }
      });
    };

    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [
    tab,
    authed,
    depositPendingCount,
    watchingDepositId,
    custodyDeposits,
    refreshCustodyDeposits,
  ]);

  async function banUserAccount(user: UserRow) {
    const reason =
      window.prompt(
        "Ban reason:",
        "Unrealistic or invalid email address",
      )?.trim() ?? "";
    if (!reason) return;

    setBanLoadingId(user.id);
    setMessage("");
    try {
      await api.banUser(user.id, reason);
      setMessage(`Banned ${user.displayName || user.email}`);
      await loadTab("users");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ban failed");
    } finally {
      setBanLoadingId(null);
    }
  }

  async function banSelectedUsers() {
    if (selectedUserIds.length === 0) return;
    const reason =
      window.prompt(
        "Ban reason for selected accounts:",
        "Unrealistic or invalid email address",
      )?.trim() ?? "";
    if (!reason) return;

    if (
      !window.confirm(
        `Ban ${selectedUserIds.length} selected account(s) with flagged emails?`,
      )
    ) {
      return;
    }

    setBulkBanLoading(true);
    setMessage("");
    try {
      const result = await api.banSuspiciousUsers(selectedUserIds, reason);
      setMessage(result.message);
      await loadTab("users");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bulk ban failed");
    } finally {
      setBulkBanLoading(false);
    }
  }

  function toggleUserSelection(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  function toggleSelectAllBanCandidates() {
    const candidates = users.filter(isBanCandidate).map((user) => user.id);
    setSelectedUserIds((prev) =>
      prev.length === candidates.length ? [] : candidates,
    );
  }

  const chatLastSyncRef = useRef<Record<string, string>>({});

  const loadChatThread = useCallback(async (userId: string, incremental = false) => {
    if (!incremental) setChatLoading(true);
    try {
      const since = incremental ? chatLastSyncRef.current[userId] : undefined;
      const thread = await api.getMessageThread(userId, since);
      const incoming = thread.messages ?? [];
      if (incremental && since) {
        if (incoming.length > 0) {
          setChatMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of incoming) byId.set(m.id, m);
            return [...byId.values()].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          });
          chatLastSyncRef.current[userId] = incoming[incoming.length - 1].createdAt;
        }
      } else {
        setChatMessages(incoming);
        if (incoming.length) {
          chatLastSyncRef.current[userId] = incoming[incoming.length - 1].createdAt;
        } else {
          delete chatLastSyncRef.current[userId];
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load chat");
    } finally {
      setChatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chatModalUser) return;
    void loadChatThread(chatModalUser.id);
    const timer = setInterval(
      () => void loadChatThread(chatModalUser.id, true),
      4000,
    );
    return () => clearInterval(timer);
  }, [chatModalUser, loadChatThread]);

  async function sendChatMessage(userId: string) {
    const body = chatDraft.trim();
    if (!body || chatSending) return;
    setChatSending(true);
    try {
      const msg = await api.sendMessage(userId, body);
      setChatMessages((prev) => [...prev, msg]);
      setChatDraft("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setChatSending(false);
    }
  }

  function openChatWithUser(user: UserRow) {
    setChatDraft("");
    setChatModalUser(user);
  }

  function closeChatModal() {
    setChatModalUser(null);
    setChatDraft("");
  }

  async function applyUserSearch() {
    const q = userSearchInput.trim();
    setLoading(true);
    setMessage("");
    try {
      await loadUsersPage(0, q);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function clearUserSearch() {
    setUserSearchInput("");
    if (!userSearch) return;
    setLoading(true);
    setMessage("");
    try {
      await loadUsersPage(0, "");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to clear search");
    } finally {
      setLoading(false);
    }
  }

  async function changeUserPage(nextPage: number) {
    const totalPages = Math.max(1, Math.ceil(userCount / USERS_PAGE_SIZE));
    if (nextPage < 0 || nextPage >= totalPages) return;
    setLoading(true);
    setMessage("");
    try {
      await loadUsersPage(nextPage, userSearch);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authed || sessionLoading || !adminSession) return;
    if (!allowedTabs.includes(tab)) return;
    void loadTab(tab);
  }, [authed, tab, loadTab, adminSession, sessionLoading, allowedTabs]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      if (loginStep === "credentials") {
        const res = await api.login(email, password);
        if ("accessToken" in res) {
          if (!hubAccessFromLoginUser(res.user)) {
            setLoginError("This account does not have admin hub access.");
            return;
          }
          sessionStorage.removeItem("admin-login-session");
          setToken(res.accessToken);
          setAdminEmail(res.user.email);
          setEmail(res.user.email);
          setLoginStep("credentials");
          setAuthed(true);
          await loadAdminSession();
          return;
        }
        const sessionId = res.loginSessionId?.trim();
        if (!sessionId) {
          throw new Error("Sign-in could not start. Check your email/password and try again.");
        }
        sessionStorage.setItem("admin-login-session", sessionId);
        setLoginSessionId(sessionId);
        setLoginStep("otp");
        setOtpCode("");
        return;
      }

      const sessionId =
        loginSessionId.trim() ||
        sessionStorage.getItem("admin-login-session")?.trim() ||
        "";
      if (!sessionId) {
        throw new Error("Session expired. Enter your email and password again.");
      }

      const res = await api.verifyLoginOtp(sessionId, otpCode.trim());
      if (!hubAccessFromLoginUser(res.user)) {
        setLoginError("This account does not have admin hub access.");
        return;
      }
      sessionStorage.removeItem("admin-login-session");
      setToken(res.accessToken);
      setAdminEmail(res.user.email);
      setEmail(res.user.email);
      setAuthed(true);
      await loadAdminSession();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  function logout() {
    setToken(null);
    setAdminEmail(null);
    setAdminSession(null);
    setSessionLoading(false);
    sessionStorage.removeItem("admin-login-session");
    setAuthed(false);
  }

  async function refresh() {
    await loadTab(tab);
    setMessage("Refreshed");
  }

  function openPaymentModal(user: UserRow) {
    setPaymentDenyReason("");
    setPaymentModalUser(user);
  }

  function closePaymentModal() {
    if (paymentActionLoading) return;
    setPaymentModalUser(null);
    setPaymentDenyReason("");
  }

  async function approveKyc(userId: string) {
    setKycActionUserId(userId);
    setMessage("");
    try {
      await api.approveKyc(userId);
      setMessage("KYC approved");
      await loadTab("kyc");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "KYC approval failed");
    } finally {
      setKycActionUserId(null);
    }
  }

  async function rejectKyc(userId: string, reason: string) {
    setKycActionUserId(userId);
    setMessage("");
    try {
      await api.rejectKyc(userId, reason.trim() || "Documents unclear");
      setMessage("KYC rejected");
      setRejectReason((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      await loadTab("kyc");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "KYC rejection failed");
    } finally {
      setKycActionUserId(null);
    }
  }

  async function approveRegistrationPayment() {
    if (!paymentModalUser) return;
    setPaymentActionLoading(true);
    setMessage("");
    try {
      const res = await api.approveRegistration(paymentModalUser.id);
      setMessage(res.message || "Registration approved");
      closePaymentModal();
      await loadTab("users");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setPaymentActionLoading(false);
    }
  }

  async function denyRegistrationPayment() {
    if (!paymentModalUser) return;
    const reason = paymentDenyReason.trim();
    if (!reason) {
      setMessage("Enter a reason before denying registration");
      return;
    }
    setPaymentActionLoading(true);
    setMessage("");
    try {
      const res = await api.denyRegistration(paymentModalUser.id, reason);
      setMessage(res.message || "Registration denied");
      closePaymentModal();
      await loadTab("users");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Denial failed");
    } finally {
      setPaymentActionLoading(false);
    }
  }

  function openApprovePayoutModal(payout: PayoutRow) {
    setMessage("");
    setApprovePayoutError("");
    setApprovePayoutExternal(false);
    setApprovePayoutModal(payout);
  }

  function closeApprovePayoutModal(force = false) {
    if (!force && approvePayoutLoading) return;
    setApprovePayoutModal(null);
    setApprovePayoutExternal(false);
  }

  function closeRefundPayoutModal(force = false) {
    if (!force && refundPayoutLoading) return;
    setRefundPayoutModal(null);
    setRefundPayoutReason("");
  }

  async function confirmRefundPayout() {
    if (!refundPayoutModal) return;
    const payout = refundPayoutModal;
    setRefundPayoutLoading(true);
    setMessage("");
    setRefundPayoutError("");
    try {
      const res = await api.refundPayout(
        payout.id,
        refundPayoutReason.trim() || undefined,
      );
      setPayouts((rows) =>
        rows.map((row) =>
          row.id === payout.id ? { ...row, status: "REJECTED" } : row,
        ),
      );
      closeRefundPayoutModal(true);
      setMessage(res.message);
      void api.payouts().then((r) => setPayouts(r.items)).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refund failed";
      setRefundPayoutError(msg);
      setMessage(msg);
    } finally {
      setRefundPayoutLoading(false);
    }
  }

  async function confirmApprovePayout() {
    if (!approvePayoutModal) return;
    const payout = approvePayoutModal;
    const settlement =
      payoutNeedsDestination(payout) && approvePayoutExternal
        ? ("external" as const)
        : undefined;
    setApprovePayoutLoading(true);
    setMessage("");
    setApprovePayoutError("");
    try {
      const res = await api.approvePayout(payout.id, settlement);
      const nextStatus =
        res.verificationRequired || res.payout?.status === "APPROVED"
          ? "APPROVED"
          : "PAID";
      setPayouts((rows) =>
        rows.map((row) =>
          row.id === payout.id
            ? {
                ...row,
                status: nextStatus,
                gatewayPayoutId: res.gatewayPayoutId ?? row.gatewayPayoutId,
              }
            : row,
        ),
      );
      closeApprovePayoutModal(true);
      if (res.verificationRequired) {
        setMessage(
          res.message ??
            "Payout queued on NOWPayments — enter the 2FA code to release funds.",
        );
        setVerifyPayoutId(payout.id);
        setVerifyCode("");
      } else {
        setMessage(
          res.alreadyProcessed
            ? "Payout was already confirmed."
            : res.creditedToWallet
              ? "Reward credited to the user's platform wallet."
              : settlement === "external"
                ? "Marked paid — user notified as approved."
                : res.message ?? "Payout confirmed.",
        );
      }
      void api.payouts().then((r) => setPayouts(r.items)).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payout confirmation failed";
      setApprovePayoutError(msg);
      setMessage(msg);
    } finally {
      setApprovePayoutLoading(false);
    }
  }

  if (!authed) {
    return (
      <div className="login">
        <h1>TraderRank Local Admin</h1>
        <p className="muted">Runs on your machine only — not on thetradeguard.com</p>
        <form onSubmit={(e) => void handleLogin(e)}>
          {loginStep === "credentials" ? (
            <>
              <label htmlFor="email">Admin email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: "1rem" }}>
                Enter the 6-digit code sent to {email}
              </p>
              <label htmlFor="otp">Sign-in code</label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                required
              />
            </>
          )}
          {loginError && <p className="message error">{loginError}</p>}
          <button type="submit" disabled={loginLoading}>
            {loginLoading
              ? "Please wait..."
              : loginStep === "credentials"
                ? "Send code"
                : "Verify & sign in"}
          </button>
          {loginStep === "otp" && (
            <button
              type="button"
              style={{ marginTop: "0.5rem", width: "100%" }}
              onClick={() => {
                setLoginStep("credentials");
                setOtpCode("");
                setLoginError("");
              }}
            >
              Back
            </button>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        tab={tab}
        allowedTabs={allowedTabs}
        sessionLoading={sessionLoading}
        staffSummary={staffSummary}
        onTabChange={changeTab}
        adminEmail={email || getAdminEmail() || "admin"}
        onRefresh={() => void refresh()}
        onLogout={logout}
      />

      <main className="main">
        {sessionLoading && (
          <p className="muted">Loading your admin access…</p>
        )}
        {!sessionLoading && allowedTabs.length === 0 && (
          <div className="page-empty">
            <h2>No review queues assigned</h2>
            <p className="muted">
              A full admin must grant you KYC or payout permissions for this
              investment console. After that, sign out and sign in again here.
            </p>
          </div>
        )}
        {!sessionLoading && allowedTabs.length > 0 && message && (
          <div
            className={`message${isErrorMessage(message) ? " error" : ""}`}
          >
            {message}
          </div>
        )}
        {loading && <p className="muted">Loading…</p>}

        

        

        

        

        

        {tab === "users" && (
          <>
            <div className="toolbar toolbar-wrap">
              <h2>
                Users ({userCount})
                {suspiciousOnly ? " — suspicious emails" : ""}
                {userSearch ? ` — “${userSearch}”` : ""}
              </h2>
              <div className="toolbar-actions toolbar-actions-wrap">
                <form
                  className="users-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void applyUserSearch();
                  }}
                >
                  <input
                    type="search"
                    placeholder="Search name or email…"
                    value={userSearchInput}
                    onChange={(e) => setUserSearchInput(e.target.value)}
                    aria-label="Search users by name or email"
                  />
                  <button type="submit" className="secondary">
                    Search
                  </button>
                  {userSearch && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void clearUserSearch()}
                    >
                      Clear
                    </button>
                  )}
                </form>
                <label className="filter-toggle">
                  <input
                    type="checkbox"
                    checked={suspiciousOnly}
                    onChange={(e) => {
                      setSuspiciousOnly(e.target.checked);
                      setUserPage(0);
                    }}
                  />
                  Suspicious emails only
                </label>
                {users.some(isBanCandidate) && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={toggleSelectAllBanCandidates}
                  >
                    {selectedUserIds.length === users.filter(isBanCandidate).length
                      ? "Clear selection"
                      : "Select flagged"}
                  </button>
                )}
                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={bulkBanLoading}
                    onClick={() => void banSelectedUsers()}
                  >
                    {bulkBanLoading
                      ? "Banning..."
                      : `Ban selected (${selectedUserIds.length})`}
                  </button>
                )}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>KYC</th>
                  <th>Paid</th>
                  <th>Wallet</th>
                  <th>Setups</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={u.emailAssessment?.suspicious ? "row-suspicious" : ""}
                  >
                    <td>
                      {isBanCandidate(u) ? (
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => toggleUserSelection(u.id)}
                          aria-label={`Select ${u.displayName}`}
                        />
                      ) : null}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setUserDetailId(u.id)}
                      >
                        {u.displayName}
                      </button>
                    </td>
                    <td
                      className={
                        u.emailAssessment?.suspicious ? "email-suspicious" : ""
                      }
                      title={
                        u.emailAssessment?.suspicious
                          ? formatEmailFlags(u.emailAssessment.reasons)
                          : undefined
                      }
                    >
                      <div className="email-cell">
                        <span>{u.email}</span>
                        {u.emailAssessment?.suspicious && (
                          <span className="email-flag">flagged</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {needsPaymentReview(u) ? (
                        <button
                          type="button"
                          className="badge-clickable pending_payment"
                          onClick={() => openPaymentModal(u)}
                          title={paymentReviewLabel(u)}
                        >
                          {paymentReviewLabel(u)}
                        </button>
                      ) : (
                        <span className={badgeClass(u.status)}>{u.status}</span>
                      )}
                    </td>
                    <td>{u.kyc?.status ?? "—"}</td>
                    <td>{u.registrationPaid ? "Yes" : "No"}</td>
                    <td
                      title={
                        (u.walletLocked ?? 0) > 0
                          ? `Locked: ${fmtMoney(u.walletLocked ?? 0)}`
                          : undefined
                      }
                    >
                      {fmtMoney(u.walletBalance ?? 0)}
                    </td>
                    <td>{u._count.signals}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="chat-link"
                        onClick={() => setUserDetailId(u.id)}
                      >
                        View
                      </button>
                      {isBanCandidate(u) && (
                        <button
                          type="button"
                          className="ban-link"
                          disabled={banLoadingId === u.id}
                          onClick={() => void banUserAccount(u)}
                        >
                          {banLoadingId === u.id ? "Banning..." : "Ban"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="chat-link"
                        onClick={() => openChatWithUser(u)}
                      >
                        Chat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {userCount > 0 && (
              <div className="pagination-bar">
                <span className="muted pagination-summary">
                  Showing {userPage * USERS_PAGE_SIZE + 1}–
                  {Math.min((userPage + 1) * USERS_PAGE_SIZE, userCount)} of{" "}
                  {userCount}
                </span>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="secondary"
                    disabled={userPage <= 0 || loading}
                    onClick={() => void changeUserPage(userPage - 1)}
                  >
                    Previous
                  </button>
                  <span className="pagination-page">
                    Page {userPage + 1} of{" "}
                    {Math.max(1, Math.ceil(userCount / USERS_PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      loading ||
                      userPage + 1 >= Math.ceil(userCount / USERS_PAGE_SIZE)
                    }
                    onClick={() => void changeUserPage(userPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {users.length === 0 && (
              <p className="muted">
                {userSearch
                  ? `No users match “${userSearch}”.`
                  : suspiciousOnly
                    ? "No suspicious emails found."
                    : "No users yet."}
              </p>
            )}
          </>
        )}

        

        {tab === "transactions" && (
          <TransactionsPanel onOpenUser={(id) => setUserDetailId(id)} />
        )}

        

        

        {tab === "kyc" && (
          <>
            <div className="toolbar toolbar-wrap">
              <h2>
                KYC submissions ({kycCount})
                {kycStatusFilter !== "all" ? ` · ${kycStatusFilter}` : ""}
              </h2>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className={kycStatusFilter === "all" ? "primary" : "secondary"}
                  onClick={() => {
                    setKycStatusFilter("all");
                    setKycPage(0);
                  }}
                >
                  All (
                  {kycCounts.pending + kycCounts.approved + kycCounts.rejected})
                </button>
                <button
                  type="button"
                  className={kycStatusFilter === "PENDING" ? "primary" : "secondary"}
                  onClick={() => {
                    setKycStatusFilter("PENDING");
                    setKycPage(0);
                  }}
                >
                  Pending ({kycCounts.pending})
                </button>
                <button
                  type="button"
                  className={kycStatusFilter === "APPROVED" ? "primary" : "secondary"}
                  onClick={() => {
                    setKycStatusFilter("APPROVED");
                    setKycPage(0);
                  }}
                >
                  Approved ({kycCounts.approved})
                </button>
                <button
                  type="button"
                  className={kycStatusFilter === "REJECTED" ? "primary" : "secondary"}
                  onClick={() => {
                    setKycStatusFilter("REJECTED");
                    setKycPage(0);
                  }}
                >
                  Rejected ({kycCounts.rejected})
                </button>
              </div>
            </div>
            <div className="kyc-grid">
              {kycQueue.length === 0 ? (
                <p className="muted">
                  {kycStatusFilter === "PENDING"
                    ? "No pending KYC submissions"
                    : kycStatusFilter === "APPROVED"
                      ? "No approved KYC submissions"
                      : kycStatusFilter === "REJECTED"
                        ? "No rejected KYC submissions"
                        : "No KYC submissions yet"}
                </p>
              ) : (
                kycQueue.map((item) => {
                  const busy = kycActionUserId === item.userId;
                  const isPending = item.status === "PENDING";
                  return (
                  <div key={item.id} className="kyc-card">
                    <p>
                      <strong>{item.user.displayName}</strong> —{" "}
                      {item.user.email ?? "No email"}
                      {" · "}
                      <span className={badgeClass(item.status.toLowerCase())}>
                        {item.status}
                      </span>
                    </p>
                    <p className="muted">
                      {item.documentType ?? "Document"}
                      {item.documentNumber ? ` · ${item.documentNumber}` : ""}
                      {item.submittedAt
                        ? ` · Submitted ${fmtDate(item.submittedAt)}`
                        : ""}
                      {item.reviewedAt
                        ? ` · Reviewed ${fmtDate(item.reviewedAt)}`
                        : ""}
                    </p>
                    {item.rejectionReason && (
                      <p className="muted" style={{ color: "#f87171" }}>
                        Rejection reason: {item.rejectionReason}
                      </p>
                    )}
                    {(item.documentFrontUrl ||
                      item.documentBackUrl ||
                      item.selfieUrl) && (
                    <div style={{ margin: "0.5rem 0", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {item.documentFrontUrl && (
                        <AdminImage src={item.documentFrontUrl} alt="ID front" />
                      )}
                      {item.documentBackUrl && (
                        <AdminImage src={item.documentBackUrl} alt="ID back" />
                      )}
                      {item.selfieUrl && (
                        <AdminImage src={item.selfieUrl} alt="Selfie" />
                      )}
                    </div>
                    )}
                    {isPending && (
                    <>
                    <input
                      placeholder="Rejection reason (if rejecting)"
                      value={rejectReason[item.userId] || ""}
                      onChange={(e) =>
                        setRejectReason({
                          ...rejectReason,
                          [item.userId]: e.target.value,
                        })
                      }
                      style={{
                        width: "100%",
                        marginBottom: "0.5rem",
                        padding: "0.5rem",
                        borderRadius: 6,
                        border: "1px solid #334155",
                        background: "#0b0f14",
                        color: "#e8eaed",
                      }}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => void approveKyc(item.userId)}
                      >
                        {busy ? "…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          void rejectKyc(
                            item.userId,
                            rejectReason[item.userId] || "Documents unclear",
                          )
                        }
                      >
                        {busy ? "…" : "Reject"}
                      </button>
                    </div>
                    </>
                    )}
                    {!isPending && item.user.id && isFullAdmin && (
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => setUserDetailId(item.user.id!)}
                        >
                          View trader
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
            {kycCount > KYC_PAGE_SIZE && (
              <div
                className="toolbar"
                style={{ marginTop: "1rem", justifyContent: "space-between" }}
              >
                <span className="muted">
                  Showing {kycPage * KYC_PAGE_SIZE + 1}–
                  {Math.min((kycPage + 1) * KYC_PAGE_SIZE, kycCount)} of {kycCount}
                </span>
                <div className="toolbar-actions">
                  <button
                    type="button"
                    disabled={kycPage <= 0 || loading}
                    onClick={() => setKycPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {kycPage + 1} of{" "}
                    {Math.max(1, Math.ceil(kycCount / KYC_PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    disabled={
                      loading || kycPage + 1 >= Math.ceil(kycCount / KYC_PAGE_SIZE)
                    }
                    onClick={() => setKycPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "payouts" && (
          <>
            <div className="toolbar">
              <h2>Payout requests</h2>
            </div>
            <p className="muted" style={{ margin: "0 0 1rem" }}>
              Every TP claim is queued here as a <strong>TP reward</strong>. Approving
              credits the trader&apos;s platform wallet. If the claim is still pending
              review, Approve also verifies the screenshots first.
            </p>

            {showSensitiveFinance && (
              <div className="kyc-card" style={{ marginBottom: "1rem" }}>
                <h3 style={{ margin: "0 0 0.5rem" }}>Credit user wallet</h3>
                <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                  Add USDT to any user&apos;s platform wallet — use for bonuses, corrections,
                  or manual refunds.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "end",
                  }}
                >
                  <label>
                    <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                      User email
                    </span>
                    <input
                      type="email"
                      value={creditWalletEmail}
                      onChange={(e) => setCreditWalletEmail(e.target.value)}
                      placeholder="trader@example.com"
                      style={{ minWidth: "14rem" }}
                    />
                  </label>
                  <label>
                    <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                      Amount (USDT)
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={creditWalletAmount}
                      onChange={(e) => setCreditWalletAmount(e.target.value)}
                      style={{ width: "7rem" }}
                    />
                  </label>
                  <label>
                    <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                      Note (optional)
                    </span>
                    <input
                      value={creditWalletNote}
                      onChange={(e) => setCreditWalletNote(e.target.value)}
                      placeholder="Bonus, correction…"
                      style={{ minWidth: "12rem" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      creditWalletLoading ||
                      !creditWalletEmail.trim() ||
                      !creditWalletAmount
                    }
                    onClick={() => {
                      setCreditWalletLoading(true);
                      setMessage("");
                      void api
                        .creditUserWallet({
                          email: creditWalletEmail.trim(),
                          amount: Number(creditWalletAmount),
                          description: creditWalletNote.trim() || undefined,
                        })
                        .then((res) => {
                          setMessage(
                            `Credited ${fmtMoney(res.amount)} to ${res.displayName} — balance ${fmtMoney(res.balance)}.` +
                              (res.emailSent
                                ? " Email sent."
                                : " Email NOT sent (check Resend)."),
                          );
                          setCreditWalletEmail("");
                          setCreditWalletAmount("");
                          setCreditWalletNote("");
                        })
                        .catch((err: Error) => setMessage(err.message))
                        .finally(() => setCreditWalletLoading(false));
                    }}
                  >
                    {creditWalletLoading ? "Crediting…" : "Credit wallet"}
                  </button>
                </div>
              </div>
            )}

            {showSensitiveFinance && (
              <div className="kyc-card" style={{ marginBottom: "1rem" }}>
                <h3 style={{ margin: "0 0 0.5rem" }}>Instant withdraw whitelist</h3>
                <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                  Users on this list have withdrawals processed instantly with no
                  admin approval. All other validation (KYC, balance, saved wallet)
                  still applies. Ops is emailed each time an instant withdrawal
                  executes.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "end",
                    marginBottom: "0.75rem",
                  }}
                >
                  <label>
                    <span
                      className="muted"
                      style={{ display: "block", fontSize: "0.75rem" }}
                    >
                      Investor email
                    </span>
                    <input
                      type="email"
                      value={instantWithdrawEmail}
                      onChange={(e) => setInstantWithdrawEmail(e.target.value)}
                      placeholder="trader@example.com"
                      style={{ minWidth: "16rem" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      instantWithdrawSaving || !instantWithdrawEmail.trim()
                    }
                    onClick={() => {
                      setInstantWithdrawSaving(true);
                      setMessage("");
                      void api
                        .addInstantWithdraw({
                          email: instantWithdrawEmail.trim(),
                        })
                        .then((res) => {
                          setInstantWithdrawUsers((prev) => {
                            const next = prev.filter((u) => u.id !== res.id);
                            next.unshift({
                              id: res.id,
                              email: res.email,
                              displayName: res.displayName,
                              walletBalance: res.walletBalance,
                              grantedAt: res.grantedAt,
                              grantedById: res.grantedById,
                            });
                            return next;
                          });
                          setInstantWithdrawEmail("");
                          setMessage(
                            `${res.displayName} can now withdraw instantly.`,
                          );
                        })
                        .catch((err: Error) => setMessage(err.message))
                        .finally(() => setInstantWithdrawSaving(false));
                    }}
                  >
                    {instantWithdrawSaving ? "Adding…" : "Add to whitelist"}
                  </button>
                </div>
                {instantWithdrawUsers.length === 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                    No users on the instant-withdraw whitelist.
                  </p>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.85rem",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "0.35rem 0" }}>
                          User
                        </th>
                        <th style={{ textAlign: "right", padding: "0.35rem 0" }}>
                          Wallet
                        </th>
                        <th style={{ textAlign: "left", padding: "0.35rem 0" }}>
                          Granted
                        </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {instantWithdrawUsers.map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: "0.35rem 0" }}>
                            <strong>{row.displayName}</strong>
                            <div className="muted" style={{ fontSize: "0.75rem" }}>
                              {row.email ?? row.id.slice(0, 8)}
                            </div>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "0.35rem 0",
                            }}
                          >
                            {fmtMoney(row.walletBalance)}
                          </td>
                          <td
                            className="muted"
                            style={{ padding: "0.35rem 0", fontSize: "0.75rem" }}
                          >
                            {row.grantedAt
                              ? new Date(row.grantedAt).toLocaleString()
                              : "—"}
                          </td>
                          <td style={{ textAlign: "right", padding: "0.35rem 0" }}>
                            <button
                              type="button"
                              className="danger"
                              disabled={instantWithdrawRemovingId === row.id}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Remove ${row.displayName} from the instant-withdraw whitelist? They'll need admin approval for future withdrawals.`,
                                  )
                                ) {
                                  return;
                                }
                                setInstantWithdrawRemovingId(row.id);
                                setMessage("");
                                void api
                                  .removeInstantWithdraw({ userId: row.id })
                                  .then(() => {
                                    setInstantWithdrawUsers((prev) =>
                                      prev.filter((u) => u.id !== row.id),
                                    );
                                    setMessage(
                                      `${row.displayName} removed from instant-withdraw whitelist.`,
                                    );
                                  })
                                  .catch((err: Error) => setMessage(err.message))
                                  .finally(() =>
                                    setInstantWithdrawRemovingId(null),
                                  );
                              }}
                            >
                              {instantWithdrawRemovingId === row.id
                                ? "Removing…"
                                : "Remove"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div className="kyc-card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: "0 0 0.5rem" }}>Weekly tier payouts</h3>
              <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                When enabled, the Monday job creates $10 / $50 / $100 USDT payouts
                based on each trader&apos;s last 10 setup results. TP reward payouts
                are unaffected.
              </p>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: weeklyTierSaving ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={weeklyTierPayoutsEnabled}
                  disabled={weeklyTierSaving}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setWeeklyTierSaving(true);
                    void api
                      .updateWeeklyTierPayoutSettings(enabled)
                      .then((res) => {
                        setWeeklyTierPayoutsEnabled(res.weeklyTierPayoutsEnabled);
                        setMessage(
                          res.weeklyTierPayoutsEnabled
                            ? "Weekly tier payouts enabled."
                            : "Weekly tier payouts disabled.",
                        );
                      })
                      .catch((err) => {
                        setMessage(
                          err instanceof Error
                            ? err.message
                            : "Could not update weekly tier payouts",
                        );
                      })
                      .finally(() => setWeeklyTierSaving(false));
                  }}
                />
                <span>
                  {weeklyTierPayoutsEnabled
                    ? "Enabled — weekly tier payouts will run"
                    : "Disabled — no new weekly tier payouts"}
                </span>
              </label>
            </div>

            <div className="kyc-card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: "0 0 0.5rem" }}>NOWPayments custody wallet</h3>
              {npWallet ? (
                <>
                  <p>
                    Available USDT balance:{" "}
                    <strong>
                      {showSensitiveFinance
                        ? fmtMoney(npWallet.usdtBalance)
                        : STATIC_NOWPAYMENTS_BALANCE_LABEL}
                    </strong>
                    {showSensitiveFinance &&
                      npWallet.pendingCryptoPayoutCount > 0 && (
                      <span className="muted">
                        {" "}
                        · {npWallet.pendingCryptoPayoutCount} pending crypto payout
                        {npWallet.pendingCryptoPayoutCount === 1 ? "" : "s"} (
                        {fmtMoney(npWallet.pendingCryptoPayoutTotal)})
                      </span>
                    )}
                  </p>
                  {!npWallet.configured && (
                    <p className="muted">{npWallet.message}</p>
                  )}
                  {npWallet.configured && npWallet.payoutConfigured === false && (
                    <p className="message error" style={{ marginTop: "0.5rem" }}>
                      {npWallet.message ??
                        "Set NOWPAYMENTS_PAYOUT_EMAIL and NOWPAYMENTS_PAYOUT_PASSWORD on traders-api (backend), then restart."}
                      <br />
                      <span className="muted">
                        Detected: email{" "}
                        {npWallet.payoutEmailSet ? "set" : "missing"} · password{" "}
                        {npWallet.payoutPasswordSet ? "set" : "missing"}. These
                        must be on the API service (traders-c53s / traders-api),
                        not traders-web.
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <p className="muted">Loading wallet…</p>
              )}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "end",
                  marginTop: "0.75rem",
                }}
              >
                <label>
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                    Top-up amount (USD)
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    style={{ width: "8rem" }}
                  />
                </label>
                <label>
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                    Network
                  </span>
                  <select
                    value={depositNetwork}
                    onChange={(e) => setDepositNetwork(e.target.value)}
                  >
                    <option value="TRC20">TRC20</option>
                    <option value="BEP20">BEP20</option>
                    <option value="ERC20">ERC20</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="primary"
                  disabled={depositLoading || !npWallet?.configured}
                  onClick={() => {
                    const amount = Number(depositAmount);
                    if (!Number.isFinite(amount) || amount <= 0) {
                      setMessage("Enter a valid deposit amount");
                      return;
                    }
                    setDepositLoading(true);
                    setMessage("");
                    void api
                      .createCustodyDeposit(amount, depositNetwork)
                      .then((res) => {
                        setActiveDeposit(res);
                        setWatchingDepositId(res.depositId);
                        setExpandedDepositId(res.depositId);
                        setMessage(res.message);
                        return refreshCustodyDeposits(false);
                      })
                      .catch((err: Error) => setMessage(err.message))
                      .finally(() => setDepositLoading(false));
                  }}
                >
                  {depositLoading ? "Creating…" : "Create deposit"}
                </button>
              </div>

              {activeDeposit?.payAddress && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    background: "var(--surface-2, rgba(0,0,0,0.04))",
                    borderRadius: "6px",
                  }}
                >
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    Send exactly{" "}
                    <strong>
                      {activeDeposit.payAmount} {activeDeposit.payCurrency}
                    </strong>{" "}
                    to:
                  </p>
                  <code style={{ wordBreak: "break-all" }}>
                    {activeDeposit.payAddress}
                  </code>
                  {activeDeposit.invoiceUrl && (
                    <p style={{ marginTop: "0.5rem" }}>
                      <a
                        href={activeDeposit.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open NOWPayments invoice
                      </a>
                    </p>
                  )}
                </div>
              )}

              <div style={{ marginTop: "1rem" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.35rem",
                    }}
                  >
                    <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
                      Custody deposits
                      {depositPendingCount > 0 && (
                        <span style={{ marginLeft: "0.5rem" }}>
                          · {depositPendingCount} pending
                          {watchingDepositId ? " (auto-checking every 15s)" : ""}
                        </span>
                      )}
                      {depositConfirmedTotal > 0 && (
                        <span style={{ marginLeft: "0.5rem" }}>
                          · {fmtMoney(depositConfirmedTotal)} confirmed total
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={depositSyncLoading}
                      onClick={() => {
                        setDepositSyncLoading(true);
                        void refreshCustodyDeposits(true)
                          .then(() => api.nowPaymentsWallet().then(setNpWallet))
                          .then(() => setMessage("Deposits synced with NOWPayments and blockchain."))
                          .catch((err: Error) => setMessage(err.message))
                          .finally(() => setDepositSyncLoading(false));
                      }}
                    >
                      {depositSyncLoading ? "Syncing…" : "Sync pending"}
                    </button>
                  </div>
                  {custodyDeposits.length === 0 ? (
                    <p className="muted" style={{ fontSize: "0.85rem" }}>
                      No custody deposits yet. Create one above to fund trader payouts.
                    </p>
                  ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Amount</th>
                        <th>Network</th>
                        <th>Progress</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Confirmed</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {custodyDeposits.map((d) => (
                        <Fragment key={d.id}>
                          <tr>
                            <td>{fmtMoney(d.amount)}</td>
                            <td>{d.network}</td>
                            <td className="muted">{depositProgressLabel(d)}</td>
                            <td>
                              <span className={badgeClass(d.status)}>{d.status}</span>
                            </td>
                            <td>{fmtDate(d.createdAt)}</td>
                            <td>{d.confirmedAt ? fmtDate(d.confirmedAt) : "—"}</td>
                            <td>
                              <div className="row-actions">
                                {d.status === "PENDING" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void api
                                        .syncCustodyDeposit(d.id)
                                        .then((res) => {
                                          setCustodyDeposits((rows) =>
                                            rows.map((row) =>
                                              row.id === d.id ? res.deposit : row,
                                            ),
                                          );
                                          if (res.confirmed) {
                                            setMessage(
                                              `Deposit confirmed${res.deposit.txHash ? ` (tx ${res.deposit.txHash.slice(0, 12)}…)` : ""}.`,
                                            );
                                            setWatchingDepositId(null);
                                            if (res.wallet) setNpWallet(res.wallet);
                                            void refreshCustodyDeposits(false);
                                          } else {
                                            setMessage(
                                              `Still pending — gateway: ${res.liveStatus ?? "waiting"}.`,
                                            );
                                          }
                                        })
                                        .catch((err: Error) => setMessage(err.message));
                                    }}
                                  >
                                    Check
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDepositId((cur) =>
                                      cur === d.id ? null : d.id,
                                    )
                                  }
                                >
                                  {expandedDepositId === d.id ? "Hide" : "Details"}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedDepositId === d.id && (
                            <tr key={`${d.id}-detail`}>
                              <td colSpan={7} style={{ background: "rgba(0,0,0,0.15)" }}>
                                <div
                                  style={{
                                    display: "grid",
                                    gap: "0.35rem",
                                    fontSize: "0.85rem",
                                    padding: "0.35rem 0",
                                  }}
                                >
                                  <p className="muted" style={{ margin: 0 }}>
                                    ID: <code>{d.id}</code>
                                    {d.gatewayId ? ` · Gateway ${d.gatewayId}` : ""}
                                  </p>
                                  {d.payAddress && (
                                    <p style={{ margin: 0, wordBreak: "break-all" }}>
                                      Pay address: <code>{d.payAddress}</code>
                                      {d.payAmount != null && (
                                        <span className="muted">
                                          {" "}
                                          · send {d.payAmount} USDT
                                        </span>
                                      )}
                                    </p>
                                  )}
                                  {d.txHash && (
                                    <p style={{ margin: 0, wordBreak: "break-all" }}>
                                      Tx: <code>{d.txHash}</code>
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  )}
                </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Destination</th>
                  <th>KYC</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.user.displayName}
                      {p.source === "TP_REWARD" && p.tpClaim?.status && (
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          Claim: {p.tpClaim.status.replace(/_/g, " ").toLowerCase()}
                        </div>
                      )}
                    </td>
                    <td className="muted">{payoutSourceLabel(p)}</td>
                    <td>{fmtMoney(p.traderShare)}</td>
                    <td>{p.payoutMethod === "MOBILE_MONEY" ? "Mobile money" : p.payoutMethod === "TRC20" ? "TRC20" : "—"}</td>
                    <td className="muted">{p.walletAddress || "—"}</td>
                    <td>{p.user.kyc?.status ?? "NONE"}</td>
                    <td>
                      <span className={badgeClass(p.status)}>{p.status}</span>
                    </td>
                    <td>{fmtDate(p.requestedAt)}</td>
                    <td>
                      {p.status === "PENDING" && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="primary"
                            onClick={() => openApprovePayoutModal(p)}
                          >
                            Approve
                          </button>
                          {canRefundPayout(p) && (
                            <button
                              type="button"
                              onClick={() => {
                                setMessage("");
                                setRefundPayoutReason("");
                                setRefundPayoutError("");
                                setRefundPayoutModal(p);
                              }}
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      )}
                      {p.status === "APPROVED" && p.gatewayPayoutId && (
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setVerifyPayoutId(p.id);
                              setVerifyCode("");
                            }}
                          >
                            Enter 2FA
                          </button>
                          {canRefundPayout(p) && (
                            <button
                              type="button"
                              onClick={() => {
                                setMessage("");
                                setRefundPayoutReason("");
                                setRefundPayoutError("");
                                setRefundPayoutModal(p);
                              }}
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      )}
                      {p.status === "PAID" && canRefundPayout(p) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMessage("");
                            setRefundPayoutReason("");
                            setRefundPayoutError("");
                            setRefundPayoutModal(p);
                          }}
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {verifyPayoutId && (
              <div className="modal-backdrop" role="dialog" aria-modal="true">
                <div className="modal">
                  <h3>NOWPayments 2FA verification</h3>
                  <p className="muted">
                    Enter the verification code sent to your NOWPayments payout account
                    email to release this payout.
                  </p>
                  <input
                    placeholder="6-digit code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    maxLength={8}
                  />
                  <div className="row-actions" style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className="primary"
                      disabled={verifyLoading || verifyCode.trim().length < 4}
                      onClick={() => {
                        setVerifyLoading(true);
                        setMessage("");
                        void api
                          .verifyPayout(verifyPayoutId, verifyCode.trim())
                          .then((res) => {
                            setMessage(res.message);
                            setVerifyPayoutId(null);
                            setVerifyCode("");
                            return loadTab("payouts");
                          })
                          .catch((err: Error) => setMessage(err.message))
                          .finally(() => setVerifyLoading(false));
                      }}
                    >
                      {verifyLoading ? "Verifying…" : "Verify payout"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyPayoutId(null);
                        setVerifyCode("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        

        

        

        

        

        

        

        {tab === "platform" && (
          <InvestorDepositorPlatform
            onMessage={setMessage}
            showSensitiveFinance={showSensitiveFinance}
          />
        )}

        

        

        
      </main>

      {paymentModalUser && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closePaymentModal}
        >
          <div
            className="modal"
            role="dialog"
            aria-labelledby="payment-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="payment-modal-title">
              {paymentModalUser.registrationPaid
                ? "Weekly access renewal"
                : "Registration payment review"}
            </h3>
            <p>
              <strong>{paymentModalUser.displayName}</strong>
              <br />
              <span className="muted">{paymentModalUser.email}</span>
            </p>
            <dl className="modal-meta">
              <div>
                <dt>Status</dt>
                <dd>{paymentModalUser.status}</dd>
              </div>
              <div>
                <dt>Registration paid</dt>
                <dd>{paymentModalUser.registrationPaid ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{fmtDate(paymentModalUser.createdAt)}</dd>
              </div>
              <div>
                <dt>Access expires</dt>
                <dd>
                  {paymentModalUser.accessExpiresAt
                    ? fmtDate(paymentModalUser.accessExpiresAt)
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="muted">
              Approve to grant 7 more trading days (Submit + MT5). Deny only for
              first-time registrations without valid payment.
            </p>
            <label htmlFor="payment-deny-reason">Denial reason (required to deny)</label>
            <textarea
              id="payment-deny-reason"
              rows={3}
              placeholder="e.g. Payment not received, duplicate account, invalid proof…"
              value={paymentDenyReason}
              onChange={(e) => setPaymentDenyReason(e.target.value)}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={paymentActionLoading}
                onClick={closePaymentModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={paymentActionLoading}
                onClick={() => void denyRegistrationPayment()}
              >
                {paymentActionLoading ? "Working…" : "Deny payment"}
              </button>
              <button
                type="button"
                className="primary"
                disabled={paymentActionLoading}
                onClick={() => void approveRegistrationPayment()}
              >
                {paymentActionLoading ? "Working…" : "Approve payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {refundPayoutModal && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => closeRefundPayoutModal()}
        >
          <div
            className="modal"
            role="dialog"
            aria-labelledby="refund-payout-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="refund-payout-modal-title">Refund wallet withdrawal</h3>
            <p>
              <strong>{refundPayoutModal.user.displayName}</strong>
              <br />
              <span className="muted">{refundPayoutModal.user.email}</span>
            </p>
            <p className="muted">
              Credits <strong>{fmtMoney(refundPayoutModal.traderShare)}</strong> back to
              the user&apos;s platform wallet and marks this payout as refunded. Use when
              funds were not sent on-chain or the withdrawal should be cancelled.
            </p>
            <dl className="modal-meta">
              <div>
                <dt>Status</dt>
                <dd>{refundPayoutModal.status}</dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd style={{ wordBreak: "break-all" }}>
                  {refundPayoutModal.walletAddress || "—"}
                </dd>
              </div>
            </dl>
            <label>
              <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                Reason (optional)
              </span>
              <input
                value={refundPayoutReason}
                onChange={(e) => setRefundPayoutReason(e.target.value)}
                placeholder="Not sent on-chain, duplicate approval…"
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </label>
            {refundPayoutError && (
              <p className="message error" style={{ marginTop: "0.75rem" }}>
                {refundPayoutError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={refundPayoutLoading}
                onClick={() => closeRefundPayoutModal()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={refundPayoutLoading}
                onClick={() => void confirmRefundPayout()}
              >
                {refundPayoutLoading ? "Refunding…" : "Refund to wallet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {approvePayoutModal && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => closeApprovePayoutModal()}
        >
          <div
            className="modal"
            role="dialog"
            aria-labelledby="approve-payout-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="approve-payout-modal-title">Confirm payout</h3>
            <p>
              <strong>{approvePayoutModal.user.displayName}</strong>
              <br />
              <span className="muted">{approvePayoutModal.user.email}</span>
            </p>
            <dl className="modal-meta">
              <div>
                <dt>Amount</dt>
                <dd>{fmtMoney(approvePayoutModal.traderShare)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>
                  {approvePayoutModal.payoutMethod === "MOBILE_MONEY"
                    ? "Mobile money"
                    : approvePayoutModal.payoutMethod === "TRC20"
                      ? "TRC20"
                      : "Not set"}
                </dd>
              </div>
              <div>
                <dt>Wallet / destination</dt>
                <dd style={{ wordBreak: "break-all" }}>
                  {approvePayoutModal.walletAddress || "Not set"}
                </dd>
              </div>
              <div>
                <dt>KYC</dt>
                <dd>{approvePayoutModal.user.kyc?.status ?? "NONE"}</dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>{fmtDate(approvePayoutModal.requestedAt)}</dd>
              </div>
              <div>
                <dt>Details</dt>
                <dd>{approvePayoutModal.notes || "—"}</dd>
              </div>
            </dl>
            <p className="muted">
              {payoutNeedsDestination(approvePayoutModal)
                ? approvePayoutExternal
                  ? "Marks this withdrawal PAID without sending via NOWPayments. Use only after you already paid the destination yourself. The user gets the normal approved email."
                  : "This will send USDT from NOWPayments to the user's saved payout destination."
                : approvePayoutModal.source === "TP_REWARD" &&
                    approvePayoutModal.tpClaim?.status === "PENDING_REVIEW"
                  ? "This verifies the TP claim screenshots and credits the reward to the platform wallet."
                  : "This will credit the user's platform wallet (not an on-chain transfer)."}
            </p>
            {payoutNeedsDestination(approvePayoutModal) && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={approvePayoutExternal}
                  disabled={approvePayoutLoading}
                  onChange={(e) => setApprovePayoutExternal(e.target.checked)}
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  Already paid externally (skip NOWPayments — marks PAID)
                </span>
              </label>
            )}
            {(approvePayoutModal.user.kyc?.status !== "APPROVED" ||
              (payoutNeedsDestination(approvePayoutModal) &&
                !approvePayoutModal.walletAddress) ||
              (payoutNeedsDestination(approvePayoutModal) &&
                !approvePayoutExternal &&
                npWallet?.payoutConfigured === false)) && (
              <p className="muted">
                Cannot approve yet:
                {approvePayoutModal.user.kyc?.status !== "APPROVED"
                  ? " KYC is not approved."
                  : ""}
                {payoutNeedsDestination(approvePayoutModal) &&
                !approvePayoutModal.walletAddress
                  ? " Payout destination is missing."
                  : ""}
                {payoutNeedsDestination(approvePayoutModal) &&
                !approvePayoutExternal &&
                npWallet?.payoutConfigured === false
                  ? ` NOWPayments payout login missing on traders-api${
                      npWallet.payoutEmailSet === false
                        ? " (NOWPAYMENTS_PAYOUT_EMAIL)"
                        : ""
                    }${
                      npWallet.payoutPasswordSet === false
                        ? " (NOWPAYMENTS_PAYOUT_PASSWORD)"
                        : ""
                    }. Set on the backend service, then redeploy — or check “Already paid externally”.`
                  : ""}
              </p>
            )}
            {approvePayoutError && (
              <p className="message error" style={{ marginTop: "0.75rem" }}>
                {approvePayoutError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={approvePayoutLoading}
                onClick={() => closeApprovePayoutModal()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  approvePayoutLoading ||
                  !canApprovePayout(
                    approvePayoutModal,
                    npWallet?.payoutConfigured !== false,
                    approvePayoutExternal,
                  )
                }
                onClick={() => void confirmApprovePayout()}
              >
                {approvePayoutLoading
                  ? "Confirming…"
                  : approvePayoutExternal
                    ? "Mark paid"
                    : "Confirm payout"}
              </button>
            </div>
          </div>
        </div>
      )}

      <UserDetailModal
        userId={userDetailId}
        onClose={() => setUserDetailId(null)}
        canManagePermissions={Boolean(adminSession?.permissions.managePermissions)}
        onKycUpdated={() => {
          if (tab === "kyc") void loadTab("kyc");
        }}
        onChat={(id) => {
          const user = users.find((u) => u.id === id);
          if (user) openChatWithUser(user);
          else setActiveChatUserId(id);
        }}
      />

      {chatModalUser && (
        <div className="modal-overlay" role="presentation" onClick={closeChatModal}>
          <div
            className="modal modal-chat"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Chat with {chatModalUser.displayName}</h3>
            <p className="muted">{chatModalUser.email}</p>
            <div className="chat-messages modal-chat-messages">
              {chatLoading && chatMessages.length === 0 ? (
                <p className="muted">Loading…</p>
              ) : chatMessages.length === 0 ? (
                <p className="muted">No messages yet.</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`chat-bubble ${
                      msg.fromAdmin ? (msg.isAgent ? "agent" : "out") : "in"
                    }`}
                  >
                    {!msg.fromAdmin && (
                      <span className="chat-sender">{msg.senderName}</span>
                    )}
                    {msg.isAgent && <span className="chat-sender">Agent</span>}
                    <p>{msg.body}</p>
                    <time>{fmtDate(msg.createdAt)}</time>
                  </div>
                ))
              )}
            </div>
            <form
              className="chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void sendChatMessage(chatModalUser.id);
              }}
            >
              <textarea
                rows={3}
                placeholder="Write to trader…"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                maxLength={4000}
              />
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={closeChatModal}>
                  Close
                </button>
                <button type="submit" className="primary" disabled={chatSending}>
                  {chatSending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
