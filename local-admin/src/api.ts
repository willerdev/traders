const API_URL = import.meta.env.VITE_API_URL || "/api/v1";

let token: string | null = localStorage.getItem("admin_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("admin_token", t);
  else localStorage.removeItem("admin_token");
}

export function getAdminEmail() {
  return localStorage.getItem("admin_email");
}

export function setAdminEmail(email: string | null) {
  if (email) localStorage.setItem("admin_email", email);
  else localStorage.removeItem("admin_email");
}

export function getToken() {
  if (!token) {
    token = localStorage.getItem("admin_token");
  }
  return token;
}

function isAuthError(status: number) {
  return status === 401 || status === 403;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authToken = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    if (isAuthError(res.status)) {
      setToken(null);
      setAdminEmail(null);
    }
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message: string }).message)
        : res.status === 502 || res.status === 503
          ? `API server unreachable — start the backend (port 4000) or check VITE_PROXY_TARGET`
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export type LoginResponse =
  | {
      requiresOtp: true;
      loginSessionId: string;
      email: string;
      message: string;
      expiresIn: number;
    }
  | { accessToken: string; user: { role: string; email: string } };

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  verifyLoginOtp: (loginSessionId: string, code: string) =>
    request<{ accessToken: string; user: { role: string; email: string } }>(
      "/auth/login/verify-otp",
      {
        method: "POST",
        body: JSON.stringify({ loginSessionId, code }),
      },
    ),

  resendLoginOtp: (loginSessionId: string) =>
    request<{ loginSessionId: string; message: string }>(
      "/auth/login/resend-otp",
      {
        method: "POST",
        body: JSON.stringify({ loginSessionId }),
      },
    ),

  overview: () => request<Record<string, unknown>>("/admin/overview"),
  paymentForecast: () => request<PaymentForecast>("/admin/payment-forecast"),
  users: (offset = 0, suspiciousOnly = false) =>
    request<{ items: UserRow[]; count: number; suspiciousOnly?: boolean }>(
      `/admin/users?limit=50&offset=${offset}${suspiciousOnly ? "&suspicious=true" : ""}`,
    ),

  getUser: (userId: string) =>
    request<AdminUserDetail>(`/admin/users/${userId}`),
  signals: (offset = 0, status?: string) =>
    request<{ items: SignalRow[]; count: number }>(
      `/admin/signals?limit=50&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
    ),
  setSetupLimit: (signalId: string) =>
    request<SetSetupLimitResult>(`/admin/signals/${encodeURIComponent(signalId)}/set-limit`, {
      method: "POST",
    }),
  approveTp1ClaimEmail: (signalId: string) =>
    request<ApproveTp1ClaimEmailResult>(
      `/admin/signals/${encodeURIComponent(signalId)}/approve-tp1-claim-email`,
      {
        method: "POST",
      },
    ),
  kycPending: () => request<KycRow[]>("/admin/kyc/pending"),
  payouts: (status?: string) =>
    request<{ items: PayoutRow[]; count: number }>(
      `/admin/payouts?limit=50${status ? `&status=${status}` : ""}`,
    ),
  payoutsPending: () => request<PayoutRow[]>("/admin/payouts/pending"),

  approveKyc: (userId: string) =>
    request(`/admin/kyc/${userId}/approve`, { method: "POST" }),
  rejectKyc: (userId: string, reason: string) =>
    request(`/admin/kyc/${userId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  approvePayout: (payoutId: string) =>
    request<ApprovePayoutResponse>(`/admin/payouts/${payoutId}/approve`, {
      method: "POST",
    }),

  verifyPayout: (payoutId: string, code: string) =>
    request<{ message: string }>(`/admin/payouts/${payoutId}/verify`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  nowPaymentsWallet: () =>
    request<NowPaymentsWalletSummary>("/admin/payouts/custody/wallet"),

  createCustodyDeposit: (amount: number, network: string) =>
    request<CustodyDepositCreated>("/admin/payouts/custody/deposit", {
      method: "POST",
      body: JSON.stringify({ amount, network }),
    }),

  custodyDeposits: (limit = 20, sync = false, status?: string) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (sync) q.set("sync", "true");
    if (status) q.set("status", status);
    return request<CustodyDepositsList | CustodyDepositRow[]>(
      `/admin/payouts/custody/deposits?${q.toString()}`,
    ).then(normalizeCustodyDepositsList);
  },

  syncCustodyDeposit: (depositId: string) =>
    request<CustodyDepositStatus>(
      `/admin/payouts/custody/deposits/${depositId}/sync`,
      { method: "POST" },
    ),

  syncAllCustodyDeposits: () =>
    request<{ scanned: number; confirmed: number }>(
      "/admin/payouts/custody/deposits/sync-all",
      { method: "POST" },
    ),

  custodyDepositStatus: (depositId: string) =>
    request<CustodyDepositStatus>(
      `/admin/payouts/custody/deposits/${depositId}`,
    ),

  tpClaimsPending: () => request<TpClaimRow[]>("/admin/tp-claims/pending"),
  approveTpClaim: (claimId: string) =>
    request(`/admin/tp-claims/${claimId}/approve`, { method: "POST" }),
  rejectTpClaim: (claimId: string, reason: string) =>
    request(`/admin/tp-claims/${claimId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  promoCodes: () => request<PromoCodeRow[]>("/admin/promo-codes"),
  createPromoCode: (data: {
    code: string;
    discountPercent?: number;
    description?: string;
    expiresInDays?: number;
  }) =>
    request<PromoCodeRow>("/admin/promo-codes", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deactivatePromoCode: (code: string) =>
    request(`/admin/promo-codes/${encodeURIComponent(code)}/deactivate`, {
      method: "POST",
    }),

  approveRegistration: (userId: string) =>
    request<{ message: string }>(`/admin/users/${userId}/registration/approve`, {
      method: "POST",
    }),

  denyRegistration: (userId: string, reason: string) =>
    request<{ message: string }>(`/admin/users/${userId}/registration/deny`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  banUser: (userId: string, reason: string) =>
    request(`/admin/users/${userId}/ban`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  banSuspiciousUsers: (userIds: string[], reason: string) =>
    request<{
      bannedCount: number;
      bannedUserIds: string[];
      skipped: { userId: string; reason: string }[];
      message: string;
    }>("/admin/users/ban-suspicious", {
      method: "POST",
      body: JSON.stringify({ userIds, reason }),
    }),

  messageThreads: () =>
    request<{ items: MessageThreadSummary[] }>("/admin/messages/threads"),

  getMessageThread: (userId: string, since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<MessageThreadDetail>(`/admin/messages/users/${userId}${qs}`);
  },

  sendMessage: (userId: string, body: string) =>
    request<DirectMessage>(`/admin/messages/users/${userId}`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  messagesUnreadCount: () =>
    request<{ count: number }>("/admin/messages/unread-count"),

  hubSenderReport: (params?: {
    days?: number;
    sort?: string;
    min_closed_trades?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.days) q.set("days", String(params.days));
    if (params?.sort) q.set("sort", params.sort);
    if (params?.min_closed_trades !== undefined) {
      q.set("min_closed_trades", String(params.min_closed_trades));
    }
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<HubSenderReport>(
      `/admin/hub/senders/report${qs ? `?${qs}` : ""}`,
    );
  },

  metaApiAccounts: (params?: {
    limit?: number;
    offset?: number;
    search?: string;
    deploymentStatus?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    if (params?.search) q.set("search", params.search);
    if (params?.deploymentStatus) {
      q.set("deploymentStatus", params.deploymentStatus);
    }
    const qs = q.toString();
    return request<MetaApiAccountsResult>(
      `/admin/hub/metaapi/accounts${qs ? `?${qs}` : ""}`,
    );
  },

  metaApiTerminal: (accountId?: string) => {
    const q = accountId
      ? `?accountId=${encodeURIComponent(accountId)}`
      : "";
    return request<MetaApiTerminalState>(
      `/admin/hub/metaapi/terminal${q}`,
    );
  },

  metaApiCopyDashboard: () =>
    request<CopyTradingDashboard>("/admin/hub/metaapi/copy-dashboard"),
};

export type PaymentForecast = {
  projection: {
    totalTraders: number;
    paidRegistrationCount: number;
    unpaidRegistrationCount: number;
    registrationFeeUsdt: number;
    projectedRegistrationRevenueUsdt: number;
    activeSetupPlans: { premium: number; pro: number };
    setupRenewalsDue30d: {
      premium: number;
      pro: number;
      total: number;
      amountUsdt: number;
    };
    projectedNextSetupRenewalRevenueUsdt: number;
    projectedCombinedNextRevenueUsdt: number;
  };
  scenarios: Array<{
    conversionPercent: number;
    unpaidConverting: number;
    registrationRevenueUsdt: number;
    setupRenewalRevenueUsdt: number;
    totalRevenueUsdt: number;
  }>;
  revenueCollected: {
    totalUsdt: number;
    byPurpose: Record<string, { count: number; totalUsdt: number }>;
  };
  paidUsers: Array<{
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    joinedAt: string;
    registrationPayment: {
      amount: number;
      confirmedAt: string | null;
      network: string;
    } | null;
  }>;
  unpaidUsers: Array<{
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    joinedAt: string;
    owedUsdt: number;
  }>;
  setupPlanSubscribers: Array<{
    userId: string;
    displayName: string;
    email: string | null;
    plan: string;
    renewsAt: string | null;
    renewalAmountUsdt: number;
  }>;
};

export type EmailAssessment = {
  suspicious: boolean;
  reasons: string[];
};

export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  registrationPaid: boolean;
  accessExpiresAt?: string | null;
  createdAt: string;
  emailAssessment?: EmailAssessment;
  kyc?: { status: string } | null;
  virtualAccount?: { tier: string; score: number; totalProfit: string } | null;
  _count: { signals: number; payouts: number };
};

export type AdminUserDetail = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  walletAddress: string | null;
  registrationPaid: boolean;
  accessExpiresAt?: string | null;
  emailVerified: boolean;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
  emailAssessment?: EmailAssessment;
  profile: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    payoutMethod: string | null;
    trc20Address: string | null;
    mobileMoneyProvider: string | null;
    mobileMoneyNumber: string | null;
    mobileMoneyAccountName: string | null;
  } | null;
  kyc: {
    status: string;
    documentType: string | null;
    documentNumber: string | null;
    documentFrontUrl: string | null;
    documentBackUrl: string | null;
    selfieUrl: string | null;
    rejectionReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  } | null;
  virtualAccount: {
    tier: string;
    balance: number;
    score: number;
    weeklyProfit: number;
    totalProfit: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
  } | null;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    network: string;
    status: string;
    purpose: string;
    txHash: string | null;
    payAddress: string | null;
    createdAt: string;
    confirmedAt: string | null;
  }>;
  payouts: Array<{
    id: string;
    status: string;
    source: string;
    traderShare: number;
    payoutMethod: string | null;
    walletAddress: string | null;
    weekNumber: number;
    year: number;
    notes: string | null;
    requestedAt: string;
    processedAt: string | null;
  }>;
  walletTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string;
    referenceId: string | null;
    createdAt: string;
  }>;
  tpClaims: Array<{
    id: string;
    symbol: string;
    direction: string;
    status: string;
    claimType: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  }>;
  counts: {
    signals: number;
    payouts: number;
    payments: number;
    tpClaims: number;
    walletTransactions: number;
  };
};

export type SignalRow = {
  signalId: string;
  symbol: string;
  direction: string;
  status: string;
  entryMin: string;
  entryMax: string;
  stopLoss: string;
  takeProfit: string;
  riskRewardRatio?: string;
  description?: string;
  screenshotUrl?: string;
  hubRecordId?: string | null;
  hubQueued?: boolean;
  metaApiQueued?: boolean;
  tp1ClaimNoticeApprovedAt?: string | null;
  submittedAt: string;
  user: { id?: string; displayName: string; email: string };
  trade?: {
    activatedAt: string | null;
    closedAt: string | null;
    isWin: boolean | null;
  } | null;
};

export type SetSetupLimitResult = {
  ok: boolean;
  signalId: string;
  channel: "metaapi" | "hub" | null;
  outcome: "placed" | "already_active" | "failed";
  orderType?: string;
  entry?: number;
  message: string;
};

export type ApproveTp1ClaimEmailResult = {
  ok: boolean;
  signalId: string;
  approvedAt: string;
  message: string;
};

export type KycRow = {
  id: string;
  userId: string;
  status: string;
  documentType: string | null;
  documentNumber?: string | null;
  documentFrontUrl?: string | null;
  documentBackUrl?: string | null;
  selfieUrl?: string | null;
  submittedAt?: string | null;
  user: { id?: string; displayName: string; email: string | null };
};

export type PayoutRow = {
  id: string;
  status: string;
  source?: string;
  notes?: string | null;
  traderShare: string;
  walletAddress?: string;
  payoutMethod?: string;
  requestedAt: string;
  gatewayPayoutId?: string | null;
  user: {
    displayName: string;
    email: string;
    kyc?: { status: string } | null;
  };
};

export type ApprovePayoutResponse = {
  verificationRequired?: boolean;
  alreadyProcessed?: boolean;
  gatewayPayoutId?: string;
  message?: string;
  payout?: { status: string };
};

export type NowPaymentsWalletSummary = {
  configured: boolean;
  message?: string;
  usdtBalance: number;
  balances?: Record<string, { amount?: number; pendingAmount?: number }>;
  pendingCryptoPayoutTotal: number;
  pendingCryptoPayoutCount: number;
};

export type CustodyDepositCreated = {
  depositId: string;
  amount: number;
  network: string;
  payCurrency?: string;
  payAmount?: number;
  payAddress?: string;
  gatewayPaymentId?: number;
  liveStatus?: string;
  invoiceUrl?: string;
  configured: boolean;
  message: string;
};

export type CustodyDepositRow = {
  id: string;
  amount: string;
  currency?: string;
  network: string;
  status: string;
  gatewayId?: string | null;
  payAddress?: string | null;
  payAmount?: number | null;
  txHash?: string | null;
  liveStatus?: string;
  createdAt: string;
  confirmedAt?: string | null;
  admin?: { email: string | null; displayName: string };
};

export type CustodyDepositsList = {
  items: CustodyDepositRow[];
  pendingCount: number;
  confirmedCount: number;
  confirmedTotalUsdt: number;
};

export function normalizeCustodyDepositsList(
  data: CustodyDepositsList | CustodyDepositRow[],
): CustodyDepositsList {
  if (Array.isArray(data)) {
    const confirmed = data.filter((d) => d.status === "CONFIRMED");
    return {
      items: data,
      pendingCount: data.filter((d) => d.status === "PENDING").length,
      confirmedCount: confirmed.length,
      confirmedTotalUsdt: confirmed.reduce(
        (sum, d) => sum + Number(d.amount),
        0,
      ),
    };
  }

  return {
    items: data.items ?? [],
    pendingCount: data.pendingCount ?? 0,
    confirmedCount: data.confirmedCount ?? 0,
    confirmedTotalUsdt: data.confirmedTotalUsdt ?? 0,
  };
}

export type CustodyDepositStatus = {
  deposit: CustodyDepositRow;
  liveStatus?: string;
  payAddress?: string;
  payAmount?: number;
  confirmed: boolean;
  wallet?: NowPaymentsWalletSummary | null;
};

export type TpClaimRow = {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  exitPrice: number;
  claimType?: string;
  beforeScreenshotUrl: string;
  afterScreenshotUrl: string;
  status: string;
  submittedAt: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  originalScreenshotUrl?: string;
  user: { id: string; displayName: string; email: string | null };
};

export type PromoCodeRow = {
  id: string;
  code: string;
  discountPercent: number;
  description: string;
  expiresAt: string;
  active: boolean;
  expired: boolean;
  valid: boolean;
  createdAt: string;
};

export type HubSenderStat = {
  rank?: number;
  sendername: string;
  closed_trades?: number;
  win_rate?: number;
  net_profit?: number;
  profit_factor?: number;
};

export type HubSenderReport = {
  days: number;
  total_senders: number;
  returned: number;
  senders: HubSenderStat[];
};

export type MetaApiAccountRow = {
  id: string;
  login: string;
  name: string;
  server: string;
  state: string;
  connectionStatus: string;
  type: string;
  region: string;
  version: number;
  baseCurrency: string;
  magic?: number;
  manualTrades?: boolean;
  copyFactoryRoles?: string[];
  tags?: string[];
  createdAt?: string;
  primaryReplica?: boolean;
};

export type MetaApiAccountsResult = {
  configured: boolean;
  count: number;
  items: MetaApiAccountRow[];
};

export type MetaApiTerminalState = {
  configured: boolean;
  defaultAccountId: string | null;
  accountId: string | null;
  account: MetaApiAccountRow | null;
  information: {
    balance: number;
    equity: number;
    currency: string;
    margin: number;
    freeMargin: number;
    leverage: number;
    tradeAllowed: boolean;
    broker?: string;
    server?: string;
    login?: number;
    accountType?: string;
  } | null;
  positions: MetaApiPositionRow[];
  error?: string;
};

export type MetaApiPositionRow = {
  id: string;
  type: string;
  symbol: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  unrealizedProfit: number;
  swap: number;
  commission: number;
  time: string;
  comment?: string;
  clientId?: string;
};

export type CopyTradingLeader = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  tier: string;
  winRate: number;
  profit: number;
};

export type CopyTradeJournalEntry = {
  id: string;
  signalId: string;
  sourceRank: number;
  sourceName: string;
  symbol: string;
  direction: string;
  volume: number | null;
  entryPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  status: string;
  profit: number | null;
  notes: string | null;
  executedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type CopyTradingDashboard = {
  configured: boolean;
  copyAccountId: string | null;
  message?: string;
  riskPercent?: number;
  leaders: CopyTradingLeader[];
  terminal: MetaApiTerminalState | null;
  journal: CopyTradeJournalEntry[];
  stats: {
    openCount: number;
    closedCount: number;
    totalRealizedProfit: number;
    floatingProfit: number;
  };
};

export type DirectMessage = {
  id: string;
  userId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  fromAdmin: boolean;
  isAgent: boolean;
};

export type MessageThreadSummary = {
  userId: string;
  displayName: string;
  email: string | null;
  status: string;
  unreadCount: number;
  agentEnabled?: boolean;
  escalatedAt?: string | null;
  lastMessage: {
    body: string;
    createdAt: string;
    fromAdmin: boolean;
    isAgent?: boolean;
    senderName: string;
  };
};

export type MessageThreadDetail = {
  userId: string;
  displayName: string;
  email: string | null;
  status: string;
  messages: DirectMessage[];
  unreadCount: number;
  agentEnabled?: boolean;
  escalatedAt?: string | null;
};
