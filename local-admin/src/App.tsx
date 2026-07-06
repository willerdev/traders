import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import {
  api,
  getToken,
  setToken,
  getAdminEmail,
  setAdminEmail,
  type KycRow,
  type PayoutRow,
  type SignalRow,
  type UserRow,
  type PromoCodeRow,
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
  type CopyTradingDashboard,
  type MarketingSchedule,
  type MarketingEmailRow,
  type ReferralSettings,
  type ReferrerRow,
  type Mt5SyncAdminOverview,
} from "./api";
import { AdminImage } from "./AdminImage";
import { Sidebar, type Tab, isAdminTab } from "./Sidebar";
import { UserDetailModal } from "./UserDetailModal";

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
  return isAdminTab(hash) ? hash : "overview";
}

function setupCanSetLimit(signal: SignalRow) {
  if (signal.status !== "OPEN") return false;
  if (signal.trade?.closedAt || signal.trade?.activatedAt) return false;
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
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [paymentForecast, setPaymentForecast] = useState<PaymentForecast | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [setupFilter, setSetupFilter] = useState<"pending" | "all">("pending");
  const [setLimitLoadingId, setSetLimitLoadingId] = useState<string | null>(null);
  const [tp1ApproveLoadingId, setTp1ApproveLoadingId] = useState<string | null>(null);
  const [kycQueue, setKycQueue] = useState<KycRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
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
  const [tpClaims, setTpClaims] = useState<TpClaimRow[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCodeRow[]>([]);
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
  const [newPromoDays, setNewPromoDays] = useState("7");
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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [banLoadingId, setBanLoadingId] = useState<string | null>(null);
  const [bulkBanLoading, setBulkBanLoading] = useState(false);
  const [marketingSchedule, setMarketingSchedule] =
    useState<MarketingSchedule | null>(null);
  const [marketingHistory, setMarketingHistory] = useState<MarketingEmailRow[]>([]);
  const [marketingHistoryCount, setMarketingHistoryCount] = useState(0);
  const [marketingAudienceView, setMarketingAudienceView] = useState<
    "unpaid_registration" | "inactive_trader"
  >("unpaid_registration");
  const [marketingRunLoading, setMarketingRunLoading] = useState(false);
  const [marketingTestLoading, setMarketingTestLoading] = useState(false);
  const [marketingTestEmail, setMarketingTestEmail] = useState("willeratmit12@gmail.com");
  const [referralSettings, setReferralSettings] =
    useState<ReferralSettings | null>(null);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [refKycAmount, setRefKycAmount] = useState("");
  const [refPaidAmount, setRefPaidAmount] = useState("");
  const [refSaving, setRefSaving] = useState(false);
  const [expandedReferrerId, setExpandedReferrerId] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const next = `#${tab}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [tab]);

  const changeTab = useCallback((next: Tab) => {
    setTab(next);
    setMessage("");
  }, []);

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

  const loadTab = useCallback(async (active: Tab) => {
    setLoading(true);
    setMessage("");
    try {
      if (active === "overview") {
        setOverview(await api.overview());
      } else if (active === "paymentForecast") {
        setPaymentForecast(await api.paymentForecast());
      } else if (active === "users") {
        const res = await api.users(0, suspiciousOnly);
        setUsers(res.items);
        setUserCount(res.count);
        setSelectedUserIds([]);
      } else if (active === "messages") {
        const res = await api.messageThreads();
        setMessageThreads(res.items);
        if (res.items.length > 0 && !activeChatUserId) {
          setActiveChatUserId(res.items[0].userId);
        }
      } else if (active === "signals") {
        const res = await api.signals(0, setupFilter === "pending" ? "OPEN" : undefined);
        setSignals(res.items);
        setSignalCount(res.count);
      } else if (active === "kyc") {
        setKycQueue(await api.kycPending());
      } else if (active === "payouts") {
        const [payoutsRes, walletRes, depositsRes] = await Promise.allSettled([
          api.payouts(),
          api.nowPaymentsWallet(),
          api.custodyDeposits(20, false),
        ]);

        if (payoutsRes.status === "fulfilled") {
          setPayouts(payoutsRes.value.items);
        } else {
          throw payoutsRes.reason;
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
      } else if (active === "tpClaims") {
        setTpClaims(await api.tpClaimsPending());
      } else if (active === "promos") {
        setPromoCodes(await api.promoCodes());
      } else if (active === "marketing") {
        const [schedule, history] = await Promise.all([
          api.marketingSchedule(),
          api.marketingHistory(100),
        ]);
        setMarketingSchedule(schedule);
        setMarketingHistory(history.items);
        setMarketingHistoryCount(history.count);
      } else if (active === "referrals") {
        const [settings, list] = await Promise.all([
          api.referralSettings(),
          api.referrers(),
        ]);
        setReferralSettings(settings);
        setRefKycAmount(String(settings.kycRewardUsdt));
        setRefPaidAmount(String(settings.paidRewardUsdt));
        setReferrers(list);
      } else if (active === "mt5Copy") {
        if (copyDashboard) {
          void loadCopyDashboard({ terminalOnly: true });
        } else {
          await loadCopyDashboard({ fastOnly: true });
          void loadCopyDashboard({ terminalOnly: true });
        }
      } else if (active === "mt5Sync") {
        const overview = await api.mt5SyncOverview();
        setMt5SyncOverview(overview);
        setMt5SyncFeeInput(String(overview.feeUsdt));
      } else if (active === "hub") {
        setMetaApiLoadError(null);
        const [reportResult, accountsResult] = await Promise.allSettled([
          api.hubSenderReport({ limit: 50, min_closed_trades: 0 }),
          api.metaApiAccounts({ limit: 100 }),
        ]);
        if (reportResult.status === "fulfilled") {
          setHubReport(reportResult.value);
        } else {
          const errMsg =
            reportResult.reason instanceof Error
              ? reportResult.reason.message
              : "Failed to load Hub sender report";
          setMessage(errMsg);
        }
        if (accountsResult.status === "fulfilled") {
          setMetaApiAccounts(accountsResult.value);
          await loadMetaApiTerminal(selectedMetaApiAccountId);
        } else {
          setMetaApiAccounts(null);
          setMetaApiTerminal(null);
          const errMsg =
            accountsResult.reason instanceof Error
              ? accountsResult.reason.message
              : "Failed to load MetaAPI accounts";
          setMetaApiLoadError(errMsg);
        }
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
  }, [suspiciousOnly, selectedMetaApiAccountId, loadMetaApiTerminal, setupFilter, copyDashboard, loadCopyDashboard]);

  useEffect(() => {
    if (!authed || copyPrefetchedRef.current) return;
    copyPrefetchedRef.current = true;
    void prefetchCopyDashboard();
  }, [authed, prefetchCopyDashboard]);

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
    if (!authed) return;
    if (tab === "messages" && activeChatUserId) {
      void loadChatThread(activeChatUserId);
      const timer = setInterval(
        () => void loadChatThread(activeChatUserId, true),
        4000,
      );
      return () => clearInterval(timer);
    }
    return undefined;
  }, [authed, tab, activeChatUserId, loadChatThread]);

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
      if (tab === "messages") {
        const res = await api.messageThreads();
        setMessageThreads(res.items);
      }
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

  useEffect(() => {
    if (authed) void loadTab(tab);
  }, [authed, tab, loadTab]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      if (loginStep === "credentials") {
        const res = await api.login(email, password);
        if ("accessToken" in res) {
          if (res.user.role !== "ADMIN") {
            setLoginError("This account is not an admin.");
            return;
          }
          sessionStorage.removeItem("admin-login-session");
          setToken(res.accessToken);
          setAdminEmail(res.user.email);
          setEmail(res.user.email);
          setLoginStep("credentials");
          setAuthed(true);
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
      if (res.user.role !== "ADMIN") {
        setLoginError("This account is not an admin.");
        return;
      }
      sessionStorage.removeItem("admin-login-session");
      setToken(res.accessToken);
      setAdminEmail(res.user.email);
      setEmail(res.user.email);
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  function logout() {
    setToken(null);
    setAdminEmail(null);
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
    setApprovePayoutModal(payout);
  }

  function closeApprovePayoutModal(force = false) {
    if (!force && approvePayoutLoading) return;
    setApprovePayoutModal(null);
  }

  async function confirmApprovePayout() {
    if (!approvePayoutModal) return;
    const payout = approvePayoutModal;
    setApprovePayoutLoading(true);
    setMessage("");
    try {
      const res = await api.approvePayout(payout.id);
      setPayouts((rows) =>
        rows.map((row) =>
          row.id === payout.id
            ? { ...row, status: "PAID", processedAt: new Date().toISOString() }
            : row,
        ),
      );
      closeApprovePayoutModal(true);
      setMessage(
        res.alreadyProcessed
          ? "Payout was already confirmed."
          : "Payout confirmed.",
      );
      void api.payouts().then((r) => setPayouts(r.items)).catch(() => {});
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Payout confirmation failed");
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

  const paymentProjection = (overview?.paymentProjection ??
    null) as PaymentProjectionOverview | null;

  return (
    <div className="app">
      <Sidebar
        tab={tab}
        onTabChange={changeTab}
        adminEmail={email || getAdminEmail() || "admin"}
        onRefresh={() => void refresh()}
        onLogout={logout}
      />

      <main className="main">
        {message && (
          <div
            className={`message${isErrorMessage(message) ? " error" : ""}`}
          >
            {message}
          </div>
        )}
        {loading && <p className="muted">Loading…</p>}

        {tab === "overview" && !loading && !overview && (
          <div className="page-empty">
            Could not load overview. Check that the API is running on port 4000
            and refresh.
          </div>
        )}

        {tab === "overview" && overview && (
          <>
            <div className="toolbar">
              <h2>Platform overview</h2>
            </div>
            <div className="cards">
              <div className="card">
                <div className="label">Total users</div>
                <div className="value">{String(overview.totalUsers ?? "—")}</div>
              </div>
              <div className="card">
                <div className="label">Active traders</div>
                <div className="value">{String(overview.activeTraders ?? "—")}</div>
              </div>
              <div className="card">
                <div className="label">Revenue</div>
                <div className="value">{fmtMoney(overview.totalRevenue as number)}</div>
              </div>
              <div className="card">
                <div className="label">KYC pending</div>
                <div className="value">{String(overview.pendingKycCount ?? "—")}</div>
              </div>
              <div className="card">
                <div className="label">Payouts pending</div>
                <div className="value">
                  {String(
                    (overview.pendingPayouts as { count?: number })?.count ?? "—",
                  )}
                </div>
              </div>
              <div className="card">
                <div className="label">TP claims pending</div>
                <div className="value">{String(overview.pendingTpClaimsCount ?? "—")}</div>
              </div>
              <div className="card">
                <div className="label">Open setups pending</div>
                <div className="value">
                  {String(overview.pendingOpenSetupsCount ?? "—")}
                </div>
              </div>
              <div className="card">
                <div className="label">Today signups</div>
                <div className="value">{String(overview.todayRegistrations ?? "—")}</div>
              </div>
              <div className="card">
                <div className="label">People paid</div>
                <div className="value">
                  {paymentProjection
                    ? `${paymentProjection.paidRegistrationCount}/${paymentProjection.totalTraders}`
                    : "—"}
                </div>
              </div>
              <div className="card">
                <div className="label">Unpaid users</div>
                <div className="value">
                  {paymentProjection
                    ? String(paymentProjection.unpaidRegistrationCount)
                    : "—"}
                </div>
              </div>
              <div className="card">
                <div className="label">If unpaid users pay now</div>
                <div className="value">
                  {paymentProjection
                    ? fmtMoney(paymentProjection.projectedRegistrationRevenueUsdt)
                    : "—"}
                </div>
              </div>
              <div className="card">
                <div className="label">Setup renewals next cycle</div>
                <div className="value">
                  {paymentProjection
                    ? fmtMoney(
                        paymentProjection.projectedNextSetupRenewalRevenueUsdt ?? 0,
                      )
                    : "—"}
                </div>
              </div>
              <div className="card">
                <div className="label">Projected next total</div>
                <div className="value">
                  {paymentProjection
                    ? fmtMoney(paymentProjection.projectedCombinedNextRevenueUsdt ?? 0)
                    : "—"}
                </div>
              </div>
            </div>
            {paymentProjection && (
              <p className="muted">
                Setup plans active now: PREMIUM{" "}
                {paymentProjection.activeSetupPlans?.premium ?? 0}, PRO{" "}
                {paymentProjection.activeSetupPlans?.pro ?? 0}. Renewals due in 30
                days: {paymentProjection.setupRenewalsDue30d?.total ?? 0} (
                {fmtMoney(paymentProjection.setupRenewalsDue30d?.amountUsdt ?? 0)}).
              </p>
            )}
            <p className="muted">
              Use the sidebar tabs to review users, setups, KYC, and payouts step by step.
            </p>
          </>
        )}

        {tab === "paymentForecast" && paymentForecast && (
          <>
            <div className="toolbar">
              <h2>Payment forecast</h2>
            </div>
            <div className="cards">
              <div className="card">
                <div className="label">Total traders</div>
                <div className="value">
                  {paymentForecast.projection.totalTraders}
                </div>
              </div>
              <div className="card">
                <div className="label">Paid registration</div>
                <div className="value">
                  {paymentForecast.projection.paidRegistrationCount}
                </div>
              </div>
              <div className="card">
                <div className="label">Unpaid registration</div>
                <div className="value">
                  {paymentForecast.projection.unpaidRegistrationCount}
                </div>
              </div>
              <div className="card">
                <div className="label">Revenue collected</div>
                <div className="value">
                  {fmtMoney(paymentForecast.revenueCollected.totalUsdt)}
                </div>
              </div>
              <div className="card">
                <div className="label">If all unpaid pay</div>
                <div className="value">
                  {fmtMoney(paymentForecast.projection.projectedRegistrationRevenueUsdt)}
                </div>
              </div>
              <div className="card">
                <div className="label">Setup renewals (next cycle)</div>
                <div className="value">
                  {fmtMoney(paymentForecast.projection.projectedNextSetupRenewalRevenueUsdt)}
                </div>
              </div>
            </div>

            <h3 style={{ marginTop: "1.5rem" }}>Conversion scenarios</h3>
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              Projected revenue if a share of unpaid users pay registration (
              {fmtMoney(paymentForecast.projection.registrationFeeUsdt)} each), plus
              setup plan renewals at full retention.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Conversion</th>
                  <th>Unpaid converting</th>
                  <th>Registration</th>
                  <th>Setup renewals</th>
                  <th>Total projected</th>
                </tr>
              </thead>
              <tbody>
                {paymentForecast.scenarios.map((row) => (
                  <tr key={row.conversionPercent}>
                    <td>{row.conversionPercent}%</td>
                    <td>{row.unpaidConverting}</td>
                    <td>{fmtMoney(row.registrationRevenueUsdt)}</td>
                    <td>{fmtMoney(row.setupRenewalRevenueUsdt)}</td>
                    <td>
                      <strong>{fmtMoney(row.totalRevenueUsdt)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: "1.5rem" }}>Revenue by type</h3>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Payments</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(paymentForecast.revenueCollected.byPurpose).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      No confirmed payments yet
                    </td>
                  </tr>
                ) : (
                  Object.entries(paymentForecast.revenueCollected.byPurpose).map(
                    ([purpose, stats]) => (
                      <tr key={purpose}>
                        <td>{purposeLabel(purpose)}</td>
                        <td>{stats.count}</td>
                        <td>{fmtMoney(stats.totalUsdt)}</td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>

            <h3 style={{ marginTop: "1.5rem" }}>
              Paid users ({paymentForecast.paidUsers.length})
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {paymentForecast.paidUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No paid registrations yet
                    </td>
                  </tr>
                ) : (
                  paymentForecast.paidUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setUserDetailId(user.id)}
                        >
                          {user.displayName}
                        </button>
                      </td>
                      <td>{user.email ?? "—"}</td>
                      <td>
                        <span className={badgeClass(user.status)}>{user.status}</span>
                      </td>
                      <td>
                        {user.registrationPayment
                          ? `${fmtMoney(user.registrationPayment.amount)} · ${user.registrationPayment.network}`
                          : "Marked paid"}
                      </td>
                      <td>{fmtDate(user.joinedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h3 style={{ marginTop: "1.5rem" }}>
              Unpaid users ({paymentForecast.unpaidUsers.length})
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Owed</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {paymentForecast.unpaidUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Everyone has paid registration
                    </td>
                  </tr>
                ) : (
                  paymentForecast.unpaidUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setUserDetailId(user.id)}
                        >
                          {user.displayName}
                        </button>
                      </td>
                      <td>{user.email ?? "—"}</td>
                      <td>
                        <span className={badgeClass(user.status)}>{user.status}</span>
                      </td>
                      <td>{fmtMoney(user.owedUsdt)}</td>
                      <td>{fmtDate(user.joinedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h3 style={{ marginTop: "1.5rem" }}>
              Setup plan subscribers ({paymentForecast.setupPlanSubscribers.length})
            </h3>
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              Renewals due in 30 days:{" "}
              {paymentForecast.projection.setupRenewalsDue30d.total} (
              {fmtMoney(paymentForecast.projection.setupRenewalsDue30d.amountUsdt)})
            </p>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Renews</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentForecast.setupPlanSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No active Premium or Pro setup plans
                    </td>
                  </tr>
                ) : (
                  paymentForecast.setupPlanSubscribers.map((sub) => (
                    <tr key={`${sub.userId}-${sub.plan}`}>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setUserDetailId(sub.userId)}
                        >
                          {sub.displayName}
                        </button>
                      </td>
                      <td>{sub.email ?? "—"}</td>
                      <td>{sub.plan}</td>
                      <td>{sub.renewsAt ? fmtDate(sub.renewsAt) : "—"}</td>
                      <td>{fmtMoney(sub.renewalAmountUsdt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === "paymentForecast" && !loading && !paymentForecast && (
          <div className="page-empty">
            Could not load payment forecast. Check that the API is running and refresh.
          </div>
        )}

        {tab === "users" && (
          <>
            <div className="toolbar toolbar-wrap">
              <h2>
                Users ({userCount})
                {suspiciousOnly ? " — suspicious emails" : ""}
              </h2>
              <div className="toolbar-actions">
                <label className="filter-toggle">
                  <input
                    type="checkbox"
                    checked={suspiciousOnly}
                    onChange={(e) => setSuspiciousOnly(e.target.checked)}
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
          </>
        )}

        {tab === "messages" && (
          <>
            <div className="toolbar">
              <h2>Direct messages</h2>
            </div>
            <div className="chat-layout">
              <aside className="chat-threads">
                {messageThreads.length === 0 ? (
                  <p className="muted" style={{ padding: "1rem" }}>
                    No conversations yet. Open a user from the Users tab and click Chat.
                  </p>
                ) : (
                  messageThreads.map((t) => (
                    <button
                      key={t.userId}
                      type="button"
                      className={`chat-thread${activeChatUserId === t.userId ? " active" : ""}`}
                      onClick={() => setActiveChatUserId(t.userId)}
                    >
                      <div className="chat-thread-top">
                        <strong>{t.displayName}</strong>
                        {t.unreadCount > 0 && (
                          <span className="chat-unread">{t.unreadCount}</span>
                        )}
                      </div>
                      <span className="muted">{t.email ?? "—"}</span>
                      {!t.agentEnabled && (
                        <span className="chat-escalated">Needs admin</span>
                      )}
                      <span className="chat-preview">
                        {t.lastMessage.isAgent ? "Agent: " : ""}
                        {t.lastMessage.body}
                      </span>
                    </button>
                  ))
                )}
              </aside>
              <section className="chat-panel">
                {!activeChatUserId ? (
                  <p className="muted">Select a conversation</p>
                ) : (
                  <>
                    <div className="chat-panel-header">
                      <strong>
                        {messageThreads.find((t) => t.userId === activeChatUserId)
                          ?.displayName ?? "Trader"}
                      </strong>
                    </div>
                    <div className="chat-messages">
                      {chatLoading && chatMessages.length === 0 ? (
                        <p className="muted">Loading…</p>
                      ) : chatMessages.length === 0 ? (
                        <p className="muted">No messages yet — send the first one.</p>
                      ) : (
                        chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`chat-bubble ${
                              msg.fromAdmin
                                ? msg.isAgent
                                  ? "agent"
                                  : "out"
                                : "in"
                            }`}
                          >
                            {!msg.fromAdmin && (
                              <span className="chat-sender">{msg.senderName}</span>
                            )}
                            {msg.isAgent && (
                              <span className="chat-sender">Agent</span>
                            )}
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
                        void sendChatMessage(activeChatUserId);
                      }}
                    >
                      <textarea
                        rows={2}
                        placeholder="Write to trader…"
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        maxLength={4000}
                      />
                      <button type="submit" className="primary" disabled={chatSending}>
                        {chatSending ? "Sending…" : "Send"}
                      </button>
                    </form>
                  </>
                )}
              </section>
            </div>
          </>
        )}

        {tab === "signals" && (
          <>
            <div className="toolbar toolbar-wrap">
              <h2>
                {setupFilter === "pending"
                  ? `Pending setups (${signalCount})`
                  : `All setups (${signalCount})`}
              </h2>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className={setupFilter === "pending" ? "primary" : "secondary"}
                  onClick={() => setSetupFilter("pending")}
                >
                  Pending (OPEN)
                </button>
                <button
                  type="button"
                  className={setupFilter === "all" ? "primary" : "secondary"}
                  onClick={() => setSetupFilter("all")}
                >
                  All statuses
                </button>
              </div>
            </div>
            {signals.length === 0 ? (
              <p className="muted">
                {setupFilter === "pending"
                  ? "No open setups awaiting resolution."
                  : "No setups submitted yet."}
              </p>
            ) : (
              <div className="kyc-grid">
                {signals.map((s) => (
                  <div key={s.signalId} className="kyc-card">
                    <p>
                      <strong>{s.user.displayName}</strong> — {s.user.email}
                    </p>
                    <p className="muted">
                      {s.symbol} {s.direction} · Entry {s.entryMin} – {s.entryMax} · SL{" "}
                      {s.stopLoss} · TP {s.takeProfit}
                    </p>
                    <p className="muted">
                      Submitted {fmtDate(s.submittedAt)} ·{" "}
                      <span className={badgeClass(s.status)}>{s.status}</span>
                      {" · "}
                      {setupProgressLabel(s)}
                    </p>
                    {s.description && (
                      <p className="muted" style={{ fontSize: "0.85rem" }}>
                        {s.description.slice(0, 200)}
                        {s.description.length > 200 ? "…" : ""}
                      </p>
                    )}
                    {s.screenshotUrl && (
                      <div style={{ margin: "0.5rem 0" }}>
                        <AdminImage src={s.screenshotUrl} alt="Setup chart" />
                      </div>
                    )}
                    <div className="row-actions">
                      {s.user.id && (
                        <button
                          type="button"
                          onClick={() => setUserDetailId(s.user.id!)}
                        >
                          View trader
                        </button>
                      )}
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        {s.hubQueued ? "Hub queued" : "Hub not queued"}
                        {" · "}
                        {s.metaApiQueued ? "MetaAPI queued" : "MetaAPI not queued"}
                      </span>
                      {setupCanSetLimit(s) && (
                        <button
                          type="button"
                          className="primary"
                          disabled={setLimitLoadingId === s.signalId}
                          onClick={() => {
                            setSetLimitLoadingId(s.signalId);
                            setMessage("");
                            void api
                              .setSetupLimit(s.signalId)
                              .then((res) => {
                                setMessage(res.message);
                                return loadTab("signals");
                              })
                              .catch((err: Error) => setMessage(err.message))
                              .finally(() => setSetLimitLoadingId(null));
                          }}
                        >
                          {setLimitLoadingId === s.signalId
                            ? "Setting limit…"
                            : setupNeedsLimit(s)
                              ? "Set limit"
                              : "Retry set limit"}
                        </button>
                      )}
                      {!s.tp1ClaimNoticeApprovedAt && (
                        <button
                          type="button"
                          disabled={tp1ApproveLoadingId === s.signalId}
                          onClick={() => {
                            setTp1ApproveLoadingId(s.signalId);
                            setMessage("");
                            void api
                              .approveTp1ClaimEmail(s.signalId)
                              .then((res) => {
                                setMessage(res.message);
                                return loadTab("signals");
                              })
                              .catch((err: Error) => setMessage(err.message))
                              .finally(() => setTp1ApproveLoadingId(null));
                          }}
                        >
                          {tp1ApproveLoadingId === s.signalId
                            ? "Approving TP1 email…"
                            : "Approve TP1 email"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "kyc" && (
          <>
            <div className="toolbar">
              <h2>KYC review ({kycQueue.length} pending)</h2>
            </div>
            <div className="kyc-grid">
              {kycQueue.length === 0 ? (
                <p className="muted">No pending KYC submissions</p>
              ) : (
                kycQueue.map((item) => {
                  const busy = kycActionUserId === item.userId;
                  return (
                  <div key={item.id} className="kyc-card">
                    <p>
                      <strong>{item.user.displayName}</strong> —{" "}
                      {item.user.email ?? "No email"}
                    </p>
                    <p className="muted">
                      {item.documentType ?? "Document"}
                      {item.submittedAt
                        ? ` · ${fmtDate(item.submittedAt)}`
                        : ""}
                    </p>
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
                  </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {tab === "payouts" && (
          <>
            <div className="toolbar">
              <h2>Payout requests</h2>
            </div>

            <div className="kyc-card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: "0 0 0.5rem" }}>NOWPayments custody wallet</h3>
              {npWallet ? (
                <>
                  <p>
                    Available USDT balance:{" "}
                    <strong>{fmtMoney(npWallet.usdtBalance)}</strong>
                    {npWallet.pendingCryptoPayoutCount > 0 && (
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
                    <td>{p.user.displayName}</td>
                    <td className="muted">
                      {p.source === "TP_REWARD"
                        ? p.notes?.replace(/^TP reward — /, "") ?? "TP reward"
                        : "Weekly tier"}
                    </td>
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
                        </div>
                      )}
                      {p.status === "APPROVED" && p.gatewayPayoutId && (
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyPayoutId(p.id);
                            setVerifyCode("");
                          }}
                        >
                          Enter 2FA
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

        {tab === "tpClaims" && (
          <>
            <div className="toolbar">
              <h2>TP claims review ({tpClaims.length} pending)</h2>
            </div>
            <div className="kyc-grid">
              {tpClaims.length === 0 ? (
                <p className="muted">No pending TP claims</p>
              ) : (
                tpClaims.map((item) => (
                  <div key={item.id} className="kyc-card">
                    <p>
                      <strong>{item.user.displayName}</strong> — {item.user.email}
                    </p>
                    <p className="muted">
                      {item.symbol} {item.direction}
                      {item.claimType === "RR_1_TO_1" ? " · 1:1 RR claim" : " · Full TP claim"}
                      {" · "}Entry {item.entryMin} – {item.entryMax} · TP {item.takeProfit}
                    </p>
                    <p className="muted">Submitted {fmtDate(item.submittedAt)}</p>
                    <div style={{ margin: "0.5rem 0", display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
                      <div>
                        <p className="muted" style={{ fontSize: "0.75rem" }}>Before</p>
                        <AdminImage src={item.beforeScreenshotUrl} alt="Before" />
                      </div>
                      <div>
                        <p className="muted" style={{ fontSize: "0.75rem" }}>After (TP)</p>
                        <AdminImage src={item.afterScreenshotUrl} alt="After" />
                      </div>
                      {item.originalScreenshotUrl && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <p className="muted" style={{ fontSize: "0.75rem" }}>Original submission</p>
                          <AdminImage src={item.originalScreenshotUrl} alt="Original setup" />
                        </div>
                      )}
                    </div>
                    <input
                      placeholder="Rejection reason (if rejecting)"
                      value={tpRejectReason[item.id] || ""}
                      onChange={(e) =>
                        setTpRejectReason({
                          ...tpRejectReason,
                          [item.id]: e.target.value,
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
                        onClick={() =>
                          void api
                            .approveTpClaim(item.id)
                            .then(() => loadTab("tpClaims"))
                        }
                      >
                        Approve & credit {item.claimType === "RR_1_TO_1" ? "1:1 RR" : "TP"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          void api
                            .rejectTpClaim(
                              item.id,
                              tpRejectReason[item.id] ||
                                "Evidence did not confirm take profit",
                            )
                            .then(() => loadTab("tpClaims"))
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === "promos" && (
          <>
            <div className="toolbar">
              <h2>Promo / invite codes</h2>
            </div>
            <p className="muted" style={{ marginBottom: "1rem" }}>
              New codes expire after 7 days by default. Create a fresh code each week
              for invites you share manually.
            </p>
            <div
              className="kyc-card"
              style={{ marginBottom: "1.5rem", maxWidth: 480 }}
            >
              <h3 style={{ marginTop: 0 }}>Create code</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <input
                  placeholder="Code (e.g. launch-march)"
                  value={newPromoCode}
                  onChange={(e) => setNewPromoCode(e.target.value)}
                  style={{
                    padding: "0.5rem",
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "#0b0f14",
                    color: "#e8eaed",
                  }}
                />
                <input
                  type="number"
                  min={1}
                  max={90}
                  placeholder="Valid for days (default 7)"
                  value={newPromoDays}
                  onChange={(e) => setNewPromoDays(e.target.value)}
                  style={{
                    padding: "0.5rem",
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "#0b0f14",
                    color: "#e8eaed",
                  }}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={!newPromoCode.trim()}
                  onClick={() =>
                    void api
                      .createPromoCode({
                        code: newPromoCode.trim(),
                        discountPercent: 100,
                        expiresInDays: Number(newPromoDays) || 7,
                      })
                      .then(() => {
                        setNewPromoCode("");
                        setMessage("Promo code created");
                        return loadTab("promos");
                      })
                      .catch((err) =>
                        setMessage(
                          err instanceof Error ? err.message : "Create failed",
                        ),
                      )
                  }
                >
                  Create (100% off, {newPromoDays || 7} days)
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {promoCodes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No promo codes yet
                    </td>
                  </tr>
                ) : (
                  promoCodes.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <code>{p.code}</code>
                      </td>
                      <td>{p.discountPercent}%</td>
                      <td>{fmtDate(p.expiresAt)}</td>
                      <td>
                        <span
                          className={badgeClass(
                            !p.active
                              ? "rejected"
                              : p.expired
                                ? "expired"
                                : "approved",
                          )}
                        >
                          {!p.active
                            ? "INACTIVE"
                            : p.expired
                              ? "EXPIRED"
                              : "ACTIVE"}
                        </span>
                      </td>
                      <td>
                        {p.active && !p.expired && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              void api
                                .deactivatePromoCode(p.code)
                                .then(() => loadTab("promos"))
                            }
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === "marketing" && (
          <>
            <div className="toolbar toolbar-wrap">
              <div>
                <h2>Email marketing</h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {marketingSchedule?.cadence ??
                    "Twice weekly — Monday and Thursday at 10:00 UTC"}
                  . Reminds unpaid users to activate and idle traders to submit setups.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void loadTab("marketing")}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={marketingTestLoading}
                  onClick={() => {
                    setMarketingTestLoading(true);
                    void api
                      .sendMarketingTestEmail(marketingTestEmail.trim() || undefined)
                      .then((res) => setMessage(res.message))
                      .catch((err) =>
                        setMessage(
                          err instanceof Error ? err.message : "Test email failed",
                        ),
                      )
                      .finally(() => setMarketingTestLoading(false));
                  }}
                >
                  {marketingTestLoading ? "Sending…" : "Send test email"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={marketingRunLoading}
                  onClick={() => {
                    setMarketingRunLoading(true);
                    void api
                      .runMarketing()
                      .then((summary) => {
                        const totals = Object.values(summary.audiences).reduce(
                          (acc, a) => ({
                            sent: acc.sent + a.sent,
                            skipped: acc.skipped + a.skipped,
                            failed: acc.failed + a.failed,
                          }),
                          { sent: 0, skipped: 0, failed: 0 },
                        );
                        setMessage(
                          `Campaign sent: ${totals.sent} emails (${totals.skipped} skipped, ${totals.failed} failed)`,
                        );
                        return loadTab("marketing");
                      })
                      .catch((err) =>
                        setMessage(
                          err instanceof Error ? err.message : "Campaign run failed",
                        ),
                      )
                      .finally(() => setMarketingRunLoading(false));
                  }}
                >
                  {marketingRunLoading ? "Sending…" : "Send campaign now"}
                </button>
              </div>
            </div>

            <div
              className="kyc-card"
              style={{ marginBottom: "1rem", maxWidth: 480, display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <input
                type="email"
                value={marketingTestEmail}
                onChange={(e) => setMarketingTestEmail(e.target.value)}
                placeholder="Test recipient email"
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  borderRadius: 6,
                  border: "1px solid #334155",
                  background: "#0b0f14",
                  color: "#e8eaed",
                }}
              />
            </div>

            {!marketingSchedule ? (
              <p className="muted">Loading schedule…</p>
            ) : (
              <>
                <div className="cards">
                  {marketingSchedule.nextRuns.slice(0, 2).map((run) => (
                    <div className="card" key={run.runsAt}>
                      <div className="label">Next: {run.label}</div>
                      <div className="value" style={{ fontSize: "1rem" }}>
                        {fmtDate(run.runsAt)}
                      </div>
                    </div>
                  ))}
                  <div className="card">
                    <div className="label">Unpaid registrations</div>
                    <div className="value">
                      {marketingSchedule.audiences.unpaid_registration.count}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">
                      Idle traders ({marketingSchedule.inactiveAfterDays}d+)
                    </div>
                    <div className="value">
                      {marketingSchedule.audiences.inactive_trader.count}
                    </div>
                  </div>
                </div>

                <div className="toolbar" style={{ marginTop: "1.25rem" }}>
                  <h3 style={{ margin: 0 }}>Recipients — next campaign</h3>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className={
                        marketingAudienceView === "unpaid_registration"
                          ? "primary"
                          : "btn-secondary"
                      }
                      onClick={() => setMarketingAudienceView("unpaid_registration")}
                    >
                      Unpaid (
                      {marketingSchedule.audiences.unpaid_registration.count})
                    </button>
                    <button
                      type="button"
                      className={
                        marketingAudienceView === "inactive_trader"
                          ? "primary"
                          : "btn-secondary"
                      }
                      onClick={() => setMarketingAudienceView("inactive_trader")}
                    >
                      Idle traders (
                      {marketingSchedule.audiences.inactive_trader.count})
                    </button>
                  </div>
                </div>
                <p className="muted" style={{ margin: "0.35rem 0 0.75rem" }}>
                  {marketingSchedule.audiences[marketingAudienceView].description}.
                  Users emailed in the last 48 hours are skipped automatically.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Trader</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Last setup</th>
                      <th>Last marketing email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketingSchedule.audiences[marketingAudienceView].recipients
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No recipients in this audience
                        </td>
                      </tr>
                    ) : (
                      marketingSchedule.audiences[
                        marketingAudienceView
                      ].recipients.map((r) => (
                        <tr key={r.userId}>
                          <td>{r.displayName}</td>
                          <td>{r.email}</td>
                          <td>
                            <span className={badgeClass(r.status)}>{r.status}</span>
                          </td>
                          <td>{fmtDate(r.createdAt)}</td>
                          <td>{r.lastSignalAt ? fmtDate(r.lastSignalAt) : "Never"}</td>
                          <td>
                            {r.lastMarketingAt ? fmtDate(r.lastMarketingAt) : "Never"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <div className="toolbar" style={{ marginTop: "1.5rem" }}>
                  <h3 style={{ margin: 0 }}>
                    Sent history ({marketingHistoryCount})
                  </h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Sent</th>
                      <th>Trader</th>
                      <th>Email</th>
                      <th>Audience</th>
                      <th>Subject</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketingHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No marketing emails sent yet
                        </td>
                      </tr>
                    ) : (
                      marketingHistory.map((m) => (
                        <tr key={m.id}>
                          <td>{fmtDate(m.sentAt)}</td>
                          <td>{m.user?.displayName ?? "—"}</td>
                          <td>{m.email}</td>
                          <td>
                            {m.audience === "unpaid_registration"
                              ? "Unpaid"
                              : "Idle trader"}
                          </td>
                          <td>{m.subject}</td>
                          <td>
                            <span
                              className={badgeClass(
                                m.status === "SENT" ? "approved" : "rejected",
                              )}
                            >
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {tab === "referrals" && (
          <>
            <div className="toolbar toolbar-wrap">
              <div>
                <h2>Referral program</h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Traders share a personal link. They earn USDT when invited users
                  complete KYC and when they pay their subscription.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadTab("referrals")}
              >
                Refresh
              </button>
            </div>

            {!referralSettings ? (
              <p className="muted">Loading referral data…</p>
            ) : (
              <>
                <div className="cards">
                  <div className="card">
                    <div className="label">Referred users</div>
                    <div className="value">{referralSettings.totalReferredUsers}</div>
                  </div>
                  <div className="card">
                    <div className="label">Rewards paid</div>
                    <div className="value">
                      {fmtMoney(referralSettings.totalRewardsPaidUsdt)}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Reward payouts</div>
                    <div className="value">{referralSettings.totalRewardsCount}</div>
                  </div>
                </div>

                <div
                  className="kyc-card"
                  style={{ margin: "1.25rem 0 1.5rem", maxWidth: 480 }}
                >
                  <h3 style={{ marginTop: 0 }}>Reward amounts (USDT)</h3>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}
                  >
                    <label style={{ fontSize: "0.85rem" }}>
                      Reward when referred user completes KYC
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={refKycAmount}
                        onChange={(e) => setRefKycAmount(e.target.value)}
                        style={{
                          display: "block",
                          width: "100%",
                          marginTop: 4,
                          padding: "0.5rem",
                          borderRadius: 6,
                          border: "1px solid #334155",
                          background: "#0b0f14",
                          color: "#e8eaed",
                        }}
                      />
                    </label>
                    <label style={{ fontSize: "0.85rem" }}>
                      Reward when referred user pays subscription
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={refPaidAmount}
                        onChange={(e) => setRefPaidAmount(e.target.value)}
                        style={{
                          display: "block",
                          width: "100%",
                          marginTop: 4,
                          padding: "0.5rem",
                          borderRadius: 6,
                          border: "1px solid #334155",
                          background: "#0b0f14",
                          color: "#e8eaed",
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary"
                      disabled={refSaving}
                      onClick={() => {
                        setRefSaving(true);
                        void api
                          .updateReferralSettings({
                            kycRewardUsdt: Number(refKycAmount),
                            paidRewardUsdt: Number(refPaidAmount),
                          })
                          .then((updated) => {
                            setReferralSettings(updated);
                            setMessage(
                              `Saved — KYC reward $${updated.kycRewardUsdt}, subscription reward $${updated.paidRewardUsdt}`,
                            );
                          })
                          .catch((err) =>
                            setMessage(
                              err instanceof Error ? err.message : "Save failed",
                            ),
                          )
                          .finally(() => setRefSaving(false));
                      }}
                    >
                      {refSaving ? "Saving…" : "Save reward amounts"}
                    </button>
                    <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                      Applies immediately to all future referral rewards. Already-paid
                      rewards are not changed.
                    </p>
                  </div>
                </div>

                <h3 style={{ margin: "0 0 0.5rem" }}>Referrers ({referrers.length})</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Trader</th>
                      <th>Code</th>
                      <th>Invited</th>
                      <th>KYC done</th>
                      <th>Subscribed</th>
                      <th>Earned</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {referrers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="muted">
                          No referrals yet
                        </td>
                      </tr>
                    ) : (
                      referrers.map((r) => (
                        <Fragment key={r.userId}>
                          <tr>
                            <td>
                              {r.displayName}
                              <div className="muted" style={{ fontSize: "0.75rem" }}>
                                {r.email ?? "—"}
                              </div>
                            </td>
                            <td>
                              <code>{r.referralCode ?? "—"}</code>
                            </td>
                            <td>{r.totalReferred}</td>
                            <td>{r.kycCompleted}</td>
                            <td>{r.subscribed}</td>
                            <td>{fmtMoney(r.totalEarnedUsdt)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                  setExpandedReferrerId(
                                    expandedReferrerId === r.userId ? null : r.userId,
                                  )
                                }
                              >
                                {expandedReferrerId === r.userId ? "Hide" : "Details"}
                              </button>
                            </td>
                          </tr>
                          {expandedReferrerId === r.userId && (
                            <tr>
                              <td colSpan={7}>
                                <div style={{ padding: "0.5rem 0" }}>
                                  {r.referrals.map((x, i) => (
                                    <div
                                      key={`${x.displayName}-${i}`}
                                      style={{
                                        display: "flex",
                                        gap: "1rem",
                                        padding: "0.35rem 0",
                                        fontSize: "0.85rem",
                                      }}
                                    >
                                      <span style={{ minWidth: 180 }}>{x.displayName}</span>
                                      <span className="muted">
                                        joined {fmtDate(x.joinedAt)}
                                      </span>
                                      <span
                                        className={badgeClass(
                                          x.kycCompleted ? "approved" : "pending",
                                        )}
                                      >
                                        {x.kycCompleted ? "KYC ✓" : "KYC pending"}
                                      </span>
                                      <span
                                        className={badgeClass(
                                          x.subscribed ? "approved" : "pending",
                                        )}
                                      >
                                        {x.subscribed ? "Subscribed" : "Not subscribed"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {tab === "mt5Copy" && (
          <>
            <div className="toolbar toolbar-wrap">
              <div>
                <h2>MT5 Copy Pool</h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Second MetaAPI account mirroring{" "}
                  {copyDashboard?.poolMode === "manual"
                    ? "your selected traders"
                    : "top 3 weekly traders (default)"}{" "}
                  at {copyDashboard?.copyRiskPercent ?? copyDashboard?.riskPercent ?? 5}% max
                  risk per trade (one trade per setup).
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  void loadCopyDashboard();
                }}
                disabled={copyDashboardLoading || copyTerminalLoading}
              >
                {copyDashboardLoading || copyTerminalLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="sub-tabs">
              <button
                type="button"
                className={`sub-tab${copySubTab === "account" ? " active" : ""}`}
                onClick={() => setCopySubTab("account")}
              >
                Account
              </button>
              <button
                type="button"
                className={`sub-tab${copySubTab === "settings" ? " active" : ""}`}
                onClick={() => setCopySubTab("settings")}
              >
                Settings
              </button>
            </div>

            {!copyDashboard && copyDashboardLoading ? (
              copySubTab === "account" ? (
                <Mt5CopyAccountSkeleton />
              ) : (
                <Mt5CopySettingsSkeleton />
              )
            ) : !copyDashboard ? (
              <p className="muted">Could not load copy pool — try Refresh.</p>
            ) : copySubTab === "account" ? (
              <>
                {copyDashboard.copyHealth && (
                  <div
                    className="kyc-card"
                    style={{
                      marginBottom: "1rem",
                      borderColor: copyDashboard.copyHealth.ready
                        ? "rgba(34,197,94,0.35)"
                        : "rgba(239,68,68,0.35)",
                    }}
                  >
                    <div className="toolbar toolbar-wrap">
                      <div>
                        <h3 style={{ margin: 0 }}>
                          Copy pool health —{" "}
                          {copyDashboard.copyHealth.ready ? "Ready" : "Not ready"}
                        </h3>
                        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                          {copyDashboard.copyHealth.message ??
                            "Waiting for first health check…"}
                        </p>
                        {copyDashboard.copyHealth.checkedAt && (
                          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                            Last checked{" "}
                            {fmtDate(copyDashboard.copyHealth.checkedAt)}
                          </p>
                        )}
                      </div>
                      <span
                        className={badgeClass(
                          copyDashboard.copyHealth.ready ? "approved" : "rejected",
                        )}
                      >
                        {copyDashboard.copyHealth.ready
                          ? "Can receive trades"
                          : "Blocked"}
                      </span>
                    </div>
                  </div>
                )}
                {!copyDashboard.configured ? (
                  <div className="kyc-card">
                    <p>{copyDashboard.message ?? "No MetaAPI account available."}</p>
                    <p className="muted" style={{ marginTop: "0.5rem" }}>
                      Connect and deploy accounts in MetaAPI first. Optionally set{" "}
                      <code>METAAPI_COPY_ACCOUNT_ID</code> to pin a specific pool account.
                    </p>
                  </div>
                ) : (
                  <>
                    {copyTerminalLoading && (
                      <p className="copy-sync-hint">Syncing live MT5 account…</p>
                    )}
                    {"copyAccountSource" in copyDashboard &&
                      copyDashboard.copyAccountSource === "auto" && (
                        <p className="muted" style={{ marginBottom: "1rem" }}>
                          Using connected MetaAPI account{" "}
                          <code>{copyDashboard.copyAccountId}</code> (auto-selected — set{" "}
                          <code>METAAPI_COPY_ACCOUNT_ID</code> to override).
                        </p>
                      )}
                    <div className="cards">
                      <div className="card">
                        <div className="label">Balance</div>
                        <div className="value">
                          {copyTerminalLoading && !copyDashboard.terminal ? (
                            <SkeletonLine width="5rem" className="skeleton-line-lg" />
                          ) : (
                            <>
                              {fmtMoney(copyDashboard.terminal?.information?.balance ?? 0)}{" "}
                              {copyDashboard.terminal?.information?.currency ?? "USD"}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="card">
                        <div className="label">Equity</div>
                        <div className="value">
                          {copyTerminalLoading && !copyDashboard.terminal ? (
                            <SkeletonLine width="5rem" className="skeleton-line-lg" />
                          ) : (
                            fmtMoney(copyDashboard.terminal?.information?.equity ?? 0)
                          )}
                        </div>
                      </div>
                      <div className="card">
                        <div className="label">Floating P/L</div>
                        <div className="value">
                          {copyTerminalLoading && !copyDashboard.terminal ? (
                            <SkeletonLine width="4rem" className="skeleton-line-lg" />
                          ) : (
                            fmtMoney(copyDashboard.stats.floatingProfit)
                          )}
                        </div>
                      </div>
                      <div className="card">
                        <div className="label">Realized P/L</div>
                        <div className="value">
                          {fmtMoney(copyDashboard.stats.totalRealizedProfit)}
                        </div>
                      </div>
                      <div className="card">
                        <div className="label">Open copies</div>
                        <div className="value">{copyDashboard.stats.openCount}</div>
                      </div>
                      <div className="card">
                        <div className="label">Copy account</div>
                        <div className="value" style={{ fontSize: "0.75rem" }}>
                          {copyDashboard.copyAccountId ?? "—"}
                        </div>
                      </div>
                    </div>

                    <h3 style={{ marginTop: "1.5rem" }}>Running trades</h3>
                    <p className="muted" style={{ margin: "0.35rem 0 0.75rem" }}>
                      Live positions on the connected MT5 copy account.
                    </p>
                    {copyTerminalLoading && !copyDashboard.terminal ? (
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
                          {Array.from({ length: 3 }).map((_, i) => (
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
                    ) : (
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
                          {(copyDashboard.terminal?.positions ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={8}>No open positions on copy account</td>
                            </tr>
                          ) : (
                            (copyDashboard.terminal?.positions ?? []).map((p) => (
                              <tr key={p.id}>
                                <td>{p.symbol}</td>
                                <td>{p.type.includes("BUY") ? "BUY" : "SELL"}</td>
                                <td>{p.volume}</td>
                                <td>{p.openPrice}</td>
                                <td>{p.currentPrice}</td>
                                <td>{p.stopLoss ?? "—"}</td>
                                <td>{p.takeProfit ?? "—"}</td>
                                <td>{fmtMoney(p.profit + p.unrealizedProfit)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="kyc-card" style={{ marginBottom: "1rem" }}>
                  <h3 style={{ marginTop: 0 }}>Risk guard &amp; alerts</h3>
                  <p className="muted" style={{ margin: "0.35rem 0 1rem" }}>
                    Each setup opens exactly one copy trade. Lot size is capped so
                    estimated SL loss never exceeds the risk percent — adjusted per
                    symbol using broker contract size, tick value, and setup SL/TP.
                  </p>
                  <div className="toolbar toolbar-wrap">
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <span className="muted">Max risk per copy trade (%)</span>
                      <input
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={copyRiskAmount}
                        onChange={(e) => setCopyRiskAmount(e.target.value)}
                        disabled={copySettingsSaving}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1 }}>
                      <span className="muted">Copy trade alert email</span>
                      <input
                        type="email"
                        value={copyNotifyEmail}
                        onChange={(e) => setCopyNotifyEmail(e.target.value)}
                        disabled={copySettingsSaving}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                      <input
                        type="checkbox"
                        checked={copyUseTwoToOneRr}
                        onChange={(e) => setCopyUseTwoToOneRr(e.target.checked)}
                        disabled={copySettingsSaving}
                      />
                      <span className="muted">Target 1:2 RR on copied trades (TP at 2× risk)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                      <input
                        type="checkbox"
                        checked={copyAutoBreakeven}
                        onChange={(e) => setCopyAutoBreakeven(e.target.checked)}
                        disabled={copySettingsSaving}
                      />
                      <span className="muted">
                        Auto breakeven at TP1 (1:1) — move SL to entry when first target hits
                      </span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                      <input
                        type="checkbox"
                        checked={copyEmailAlerts}
                        onChange={(e) => setCopyEmailAlerts(e.target.checked)}
                        disabled={copySettingsSaving}
                      />
                      <span className="muted">
                        Email alerts on trade opened, BE hit (TP1), and TP hit — sent to notify email above
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ alignSelf: "flex-end" }}
                      disabled={copySettingsSaving}
                      onClick={() => {
                        const copyRiskPercent = Number(copyRiskAmount);
                        if (!Number.isFinite(copyRiskPercent) || copyRiskPercent <= 0) {
                          setMessage("Enter a valid risk percent.");
                          return;
                        }
                        if (!copyNotifyEmail.trim()) {
                          setMessage("Enter a notify email.");
                          return;
                        }
                        setCopySettingsSaving(true);
                        void api
                          .updateCopySettings({
                            copyRiskPercent,
                            copyNotifyEmail: copyNotifyEmail.trim(),
                            copyUseTwoToOneRr,
                            copyAutoBreakevenEnabled: copyAutoBreakeven,
                            copyEmailAlertsEnabled: copyEmailAlerts,
                          })
                          .then((updated) => {
                            setCopyRiskAmount(String(updated.copyRiskPercent));
                            setCopyNotifyEmail(updated.copyNotifyEmail);
                            setCopyUseTwoToOneRr(updated.copyUseTwoToOneRr ?? true);
                            setCopyAutoBreakeven(updated.copyAutoBreakevenEnabled ?? true);
                            setCopyEmailAlerts(updated.copyEmailAlertsEnabled ?? true);
                            setCopyDashboard((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    copyRiskPercent: updated.copyRiskPercent,
                                    copyNotifyEmail: updated.copyNotifyEmail,
                                    copyUseTwoToOneRr: updated.copyUseTwoToOneRr,
                                    copyAutoBreakevenEnabled:
                                      updated.copyAutoBreakevenEnabled,
                                    copyEmailAlertsEnabled:
                                      updated.copyEmailAlertsEnabled,
                                    riskPercent: updated.copyRiskPercent,
                                  }
                                : prev,
                            );
                            setMessage("Copy risk settings saved.");
                          })
                          .catch((err) =>
                            setMessage(
                              err instanceof Error ? err.message : "Could not save settings",
                            ),
                          )
                          .finally(() => setCopySettingsSaving(false));
                      }}
                    >
                      {copySettingsSaving ? "Saving…" : "Save settings"}
                    </button>
                  </div>
                </div>

                <div className="kyc-card" style={{ marginBottom: "1rem" }}>
                  <div className="toolbar toolbar-wrap" style={{ marginBottom: "0.75rem" }}>
                    <div>
                      <h3 style={{ margin: 0 }}>Copy trader pool</h3>
                      <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                        {copyDashboard.poolMode === "manual" ? (
                          <>
                            Manual pool —{" "}
                            {copyDashboard.poolTraders?.length ?? 0} trader
                            {(copyDashboard.poolTraders?.length ?? 0) === 1 ? "" : "s"}{" "}
                            selected. Only these traders are mirrored.
                          </>
                        ) : (
                          <>
                            Auto mode — empty pool falls back to this week&apos;s top 3
                            leaderboard. Add traders below to override.
                          </>
                        )}
                      </p>
                    </div>
                    <span className={badgeClass(copyDashboard.poolMode === "manual" ? "approved" : "pending")}>
                      {copyDashboard.poolMode === "manual" ? "Manual" : "Auto top 3"}
                    </span>
                  </div>

                  <div className="toolbar toolbar-wrap" style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1 }}>
                      <span className="muted">Add from weekly leaderboard</span>
                      <select
                        value={copyPoolAddUserId}
                        onChange={(e) => setCopyPoolAddUserId(e.target.value)}
                        disabled={copyPoolLoading}
                      >
                        <option value="">Select trader…</option>
                        {(copyDashboard.weeklyLeaderboard ?? [])
                          .filter(
                            (leader) =>
                              !(copyDashboard.poolTraders ?? []).some(
                                (p) => p.userId === leader.userId,
                              ),
                          )
                          .map((leader) => (
                            <option key={leader.userId} value={leader.userId}>
                              #{leader.rank} {leader.displayName} — {leader.tier}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ alignSelf: "flex-end" }}
                      disabled={!copyPoolAddUserId || copyPoolLoading}
                      onClick={() => {
                        if (!copyPoolAddUserId) return;
                        setCopyPoolLoading(true);
                        void api
                          .addCopyPoolTrader(copyPoolAddUserId)
                          .then((res) => {
                            setCopyDashboard((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    poolMode: "manual",
                                    poolTraders: res.poolTraders,
                                    leaders: res.leaders,
                                  }
                                : prev,
                            );
                            setCopyPoolAddUserId("");
                            setMessage("Trader added to copy pool.");
                          })
                          .catch((err) =>
                            setMessage(
                              err instanceof Error ? err.message : "Could not add trader",
                            ),
                          )
                          .finally(() => setCopyPoolLoading(false));
                      }}
                    >
                      {copyPoolLoading ? "Saving…" : "Add trader"}
                    </button>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Trader</th>
                        <th>Tier</th>
                        <th>Score</th>
                        <th>Added</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(copyDashboard.poolTraders ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={6}>
                            No manual selections — using weekly top 3 until you add traders.
                          </td>
                        </tr>
                      ) : (
                        (copyDashboard.poolTraders ?? []).map((trader) => (
                          <tr key={trader.userId}>
                            <td>{trader.rank != null ? `#${trader.rank}` : "—"}</td>
                            <td>{trader.displayName}</td>
                            <td>{trader.tier ?? "—"}</td>
                            <td>{trader.score ?? "—"}</td>
                            <td>{fmtDate(trader.addedAt)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={copyPoolLoading}
                                onClick={() => {
                                  setCopyPoolLoading(true);
                                  void api
                                    .removeCopyPoolTrader(trader.userId)
                                    .then((res) => {
                                      setCopyDashboard((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              poolMode:
                                                res.poolTraders.length > 0 ? "manual" : "auto",
                                              poolTraders: res.poolTraders,
                                              leaders: res.leaders,
                                            }
                                          : prev,
                                      );
                                      setMessage("Trader removed from copy pool.");
                                    })
                                    .catch((err) =>
                                      setMessage(
                                        err instanceof Error
                                          ? err.message
                                          : "Could not remove trader",
                                      ),
                                    )
                                    .finally(() => setCopyPoolLoading(false));
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <h3 style={{ marginTop: "0.5rem" }}>
                  {copyDashboard.poolMode === "manual"
                    ? "Traders being copied"
                    : "Top 3 traders copied (auto)"}
                </h3>
                <p className="muted" style={{ margin: "0.35rem 0 0.75rem" }}>
                  Weekly leaderboard stats plus historical win rates from mirrored copy
                  trades on this account.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Trader</th>
                      <th>Tier</th>
                      <th>Weekly win</th>
                      <th>Platform win</th>
                      <th>Copy win</th>
                      <th>Copy trades</th>
                      <th>Copy P/L</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copyDashboard.leaders.length === 0 ? (
                      <tr>
                        <td colSpan={9}>No traders in copy pool</td>
                      </tr>
                    ) : (
                      copyDashboard.leaders.map((leader) => (
                        <tr key={leader.userId}>
                          <td>#{leader.rank}</td>
                          <td>{leader.displayName}</td>
                          <td>{leader.tier}</td>
                          <td>{fmtPercent(leader.winRate)}</td>
                          <td>{fmtPercent(leader.platformWinRate)}</td>
                          <td>{fmtPercent(leader.copyWinRate, true)}</td>
                          <td>
                            {leader.copyTradesClosed ?? 0} closed
                            {(leader.copyTradesTotal ?? 0) > (leader.copyTradesClosed ?? 0)
                              ? ` · ${leader.copyTradesTotal} total`
                              : ""}
                          </td>
                          <td>{fmtMoney(leader.copyTotalProfit ?? 0)}</td>
                          <td>{leader.source === "pool" ? "Manual" : "Auto"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <h3 style={{ marginTop: "1.5rem" }}>Copy journal</h3>
                <p className="muted" style={{ margin: "0.35rem 0 0.75rem" }}>
                  Recent mirrored trades and outcomes on the copy account.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Trader</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Status</th>
                      <th>P/L</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copyDashboard.journal.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No copied trades yet</td>
                      </tr>
                    ) : (
                      copyDashboard.journal.map((row) => (
                        <tr key={row.id}>
                          <td>
                            #{row.sourceRank} {row.sourceName}
                          </td>
                          <td>{row.symbol}</td>
                          <td>{row.direction}</td>
                          <td>
                            <span className={badgeClass(row.status)}>{row.status}</span>
                          </td>
                          <td>{row.profit != null ? fmtMoney(row.profit) : "—"}</td>
                          <td>{fmtDate(row.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {tab === "mt5Sync" && (
          <>
            <div className="toolbar toolbar-wrap">
              <div>
                <h2>MT5 Live Sync</h2>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Weekly add-on — subscribers trade on a linked pool account; the platform
                  auto-creates setups and mirrors on the default MT5 account.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadTab("mt5Sync")}
              >
                Refresh
              </button>
            </div>

            {!mt5SyncOverview ? (
              <p className="muted">Loading MT5 Live Sync…</p>
            ) : (
              <>
                <div className="kyc-card" style={{ marginBottom: "1rem" }}>
                  <h3 style={{ marginTop: 0 }}>Billing &amp; subscribers</h3>
                  <div className="toolbar toolbar-wrap">
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <span className="muted">Weekly fee (USDT)</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        step="0.01"
                        value={mt5SyncFeeInput}
                        onChange={(e) => setMt5SyncFeeInput(e.target.value)}
                        disabled={mt5SyncSaving}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={mt5SyncSaving}
                      onClick={() => {
                        const fee = Number(mt5SyncFeeInput);
                        if (!Number.isFinite(fee) || fee <= 0) {
                          setMessage("Enter a valid fee");
                          return;
                        }
                        setMt5SyncSaving(true);
                        api
                          .updateMt5SyncFee(fee)
                          .then((res) => {
                            setMt5SyncOverview((prev) =>
                              prev ? { ...prev, feeUsdt: res.feeUsdt } : prev,
                            );
                            setMessage("MT5 Live Sync fee updated.");
                          })
                          .catch((err) =>
                            setMessage(
                              err instanceof Error ? err.message : "Could not update fee",
                            ),
                          )
                          .finally(() => setMt5SyncSaving(false));
                      }}
                    >
                      {mt5SyncSaving ? "Saving…" : "Save fee"}
                    </button>
                  </div>
                  <p className="muted" style={{ marginTop: "1rem" }}>
                    Active subscribers: <strong>{mt5SyncOverview.activeSubscribers}</strong>
                    {" · "}
                    Open sync links: <strong>{mt5SyncOverview.openLinks}</strong>
                  </p>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Symbol</th>
                        <th>Signal</th>
                        <th>Status</th>
                        <th>Last sync</th>
                        <th>Error</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mt5SyncOverview.recentLinks.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="muted">
                            No sync links yet.
                          </td>
                        </tr>
                      ) : (
                        mt5SyncOverview.recentLinks.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.user}
                              {row.email ? (
                                <div className="muted" style={{ fontSize: "0.85em" }}>
                                  {row.email}
                                </div>
                              ) : null}
                            </td>
                            <td>{row.symbol}</td>
                            <td>
                              <code>{row.signalId.slice(0, 8)}…</code>
                              <div className="muted" style={{ fontSize: "0.85em" }}>
                                {row.signalStatus}
                              </div>
                            </td>
                            <td>
                              <span className={badgeClass(row.status)}>{row.status}</span>
                            </td>
                            <td>{fmtDate(row.lastSyncedAt)}</td>
                            <td className="muted">{row.lastError ?? "—"}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => {
                                  if (
                                    !confirm(
                                      `Deactivate MT5 Live Sync for ${row.user}?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  setMt5SyncSaving(true);
                                  api
                                    .deactivateMt5SyncUser(row.userId)
                                    .then(() => {
                                      setMessage("MT5 Live Sync deactivated.");
                                      void loadTab("mt5Sync");
                                    })
                                    .catch((err) =>
                                      setMessage(
                                        err instanceof Error
                                          ? err.message
                                          : "Could not deactivate",
                                      ),
                                    )
                                    .finally(() => setMt5SyncSaving(false));
                                }}
                              >
                                Deactivate
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {tab === "hub" && (
          <>
            <div className="page-header">
              <h2>Hub MT5 &amp; MetaAPI</h2>
              <p className="hint">
                Connected broker accounts, live balance, open positions, and Signal
                Hub execution stats.
              </p>
            </div>
            <h2>MetaAPI connected accounts</h2>
            <p className="hint">
              Broker MT4/MT5 accounts linked to your MetaAPI token (
              {metaApiAccounts?.count ?? 0} total)
            </p>
            {!metaApiLoadError && metaApiAccounts?.configured === false ? (
              <p className="hint">
                METAAPI_TOKEN is not set on the API server. Add it to backend
                env and restart the API.
              </p>
            ) : metaApiLoadError ? (
              <p className="hint">
                Could not load MetaAPI accounts: {metaApiLoadError}
                {metaApiLoadError.includes("Cannot GET") ? (
                  <>
                    {" "}
                    — deploy the latest API or point local-admin at a backend
                    that includes the MetaAPI routes (
                    <code>VITE_PROXY_TARGET=http://localhost:4000</code>).
                  </>
                ) : null}
              </p>
            ) : metaApiAccounts ? (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Login</th>
                    <th>Server</th>
                    <th>State</th>
                    <th>Connection</th>
                    <th>Type</th>
                    <th>Region</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {metaApiAccounts.items.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No MetaAPI accounts found</td>
                    </tr>
                  ) : (
                    metaApiAccounts.items.map((a) => (
                      <tr
                        key={a.id}
                        className={
                          selectedMetaApiAccountId === a.id
                            ? "row-selected"
                            : undefined
                        }
                        style={{ cursor: "pointer" }}
                        onClick={() => void loadMetaApiTerminal(a.id)}
                        title="Click to view balance and open trades"
                      >
                        <td>{a.name || "—"}</td>
                        <td>{a.login}</td>
                        <td>{a.server}</td>
                        <td>
                          <span className={`badge ${badgeClass(a.state)}`}>
                            {a.state}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${badgeClass(a.connectionStatus)}`}
                          >
                            {a.connectionStatus}
                          </span>
                        </td>
                        <td>{a.type}</td>
                        <td>{a.region}</td>
                        <td>{a.baseCurrency || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <p className="hint">Loading MetaAPI accounts…</p>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "1.5rem",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0 }}>Account balance &amp; open trades</h2>
              <button
                type="button"
                className="btn-secondary"
                disabled={metaApiTerminalLoading || !metaApiAccounts?.configured}
                onClick={() =>
                  void loadMetaApiTerminal(selectedMetaApiAccountId)
                }
              >
                {metaApiTerminalLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p className="hint">
              {selectedMetaApiAccountId
                ? `Showing terminal state for account ${selectedMetaApiAccountId}`
                : metaApiTerminal?.defaultAccountId
                  ? `Using default account ${metaApiTerminal.defaultAccountId}`
                  : "Click an account row above or set METAAPI_DEFAULT_ACCOUNT_ID"}
            </p>

            {metaApiTerminalLoading && !metaApiTerminal ? (
              <p className="hint">Loading balance and positions…</p>
            ) : metaApiTerminal?.error ? (
              <p className="hint">{metaApiTerminal.error}</p>
            ) : metaApiTerminal?.information ? (
              <>
                <div className="cards">
                  <div className="card">
                    <div className="label">Balance</div>
                    <div className="value">
                      {fmtMoney(metaApiTerminal.information.balance)}{" "}
                      {metaApiTerminal.information.currency}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Equity</div>
                    <div className="value">
                      {fmtMoney(metaApiTerminal.information.equity)}{" "}
                      {metaApiTerminal.information.currency}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Margin used</div>
                    <div className="value">
                      {fmtMoney(metaApiTerminal.information.margin)}{" "}
                      {metaApiTerminal.information.currency}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Free margin</div>
                    <div className="value">
                      {fmtMoney(metaApiTerminal.information.freeMargin)}{" "}
                      {metaApiTerminal.information.currency}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Leverage</div>
                    <div className="value">
                      1:{metaApiTerminal.information.leverage || "—"}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Open positions</div>
                    <div className="value">{metaApiTerminal.positions.length}</div>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Volume</th>
                      <th>Open</th>
                      <th>Current</th>
                      <th>SL</th>
                      <th>TP</th>
                      <th>P/L</th>
                      <th>Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaApiTerminal.positions.length === 0 ? (
                      <tr>
                        <td colSpan={10}>No open positions on this account</td>
                      </tr>
                    ) : (
                      metaApiTerminal.positions.map((p) => (
                        <tr key={p.id}>
                          <td>{p.id}</td>
                          <td>{p.symbol}</td>
                          <td>
                            {p.type.includes("BUY") ? "BUY" : "SELL"}
                          </td>
                          <td>{p.volume}</td>
                          <td>{p.openPrice}</td>
                          <td>{p.currentPrice}</td>
                          <td>{p.stopLoss ?? "—"}</td>
                          <td>{p.takeProfit ?? "—"}</td>
                          <td
                            style={{
                              color: p.profit >= 0 ? "#22c55e" : "#ef4444",
                            }}
                          >
                            {fmtMoney(p.profit)}
                          </td>
                          <td>
                            {p.time
                              ? new Date(p.time).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="hint">No terminal data available yet.</p>
            )}

            <h2 style={{ marginTop: "2rem" }}>Signal Hub sender report (MT5)</h2>
            <p className="hint">
              Quantum execution stats — net P/L, win rate, closed trades (last{" "}
              {hubReport?.days ?? 90} days)
            </p>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Sender</th>
                  <th>Closed</th>
                  <th>Win rate</th>
                  <th>Net P/L</th>
                  <th>PF</th>
                </tr>
              </thead>
              <tbody>
                {!hubReport || (hubReport.senders ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6}>No Hub sender data (Hub may be unconfigured)</td>
                  </tr>
                ) : (
                  (hubReport.senders ?? []).map((s, i) => (
                    <tr key={s.sendername}>
                      <td>{s.rank ?? i + 1}</td>
                      <td>{s.sendername}</td>
                      <td>{s.closed_trades ?? 0}</td>
                      <td>
                        {s.win_rate != null
                          ? `${(Number(s.win_rate) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td>{fmtMoney(s.net_profit ?? 0)}</td>
                      <td>
                        {s.profit_factor != null
                          ? Number(s.profit_factor).toFixed(2)
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
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
            {(approvePayoutModal.user.kyc?.status !== "APPROVED" ||
              !approvePayoutModal.walletAddress) && (
              <p className="muted">
                Cannot approve yet:
                {approvePayoutModal.user.kyc?.status !== "APPROVED"
                  ? " KYC is not approved."
                  : ""}
                {!approvePayoutModal.walletAddress
                  ? " Payout destination is missing."
                  : ""}
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
                  approvePayoutModal.user.kyc?.status !== "APPROVED" ||
                  !approvePayoutModal.walletAddress
                }
                onClick={() => void confirmApprovePayout()}
              >
                {approvePayoutLoading ? "Confirming…" : "Confirm payout"}
              </button>
            </div>
          </div>
        </div>
      )}

      <UserDetailModal
        userId={userDetailId}
        onClose={() => setUserDetailId(null)}
        onKycUpdated={() => {
          if (tab === "kyc") void loadTab("kyc");
        }}
        onChat={(id) => {
          const user = users.find((u) => u.id === id);
          if (user) openChatWithUser(user);
          else {
            setTab("messages");
            setActiveChatUserId(id);
          }
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
