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
  users: (offset = 0, suspiciousOnly = false) =>
    request<{ items: UserRow[]; count: number; suspiciousOnly?: boolean }>(
      `/admin/users?limit=50&offset=${offset}${suspiciousOnly ? "&suspicious=true" : ""}`,
    ),
  signals: (offset = 0) =>
    request<{ items: SignalRow[]; count: number }>(
      `/admin/signals?limit=50&offset=${offset}`,
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
    request(`/admin/payouts/${payoutId}/approve`, { method: "POST" }),

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
  createdAt: string;
  emailAssessment?: EmailAssessment;
  kyc?: { status: string } | null;
  virtualAccount?: { tier: string; score: number; totalProfit: string } | null;
  _count: { signals: number; payouts: number };
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
  submittedAt: string;
  user: { displayName: string; email: string };
};

export type KycRow = {
  id: string;
  userId: string;
  documentType: string;
  documentFrontUrl?: string;
  selfieUrl?: string;
  user: { displayName: string; email: string };
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
  user: {
    displayName: string;
    email: string;
    kyc?: { status: string } | null;
  };
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
