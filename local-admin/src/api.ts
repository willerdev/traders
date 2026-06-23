const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";

let token: string | null = localStorage.getItem("admin_token");

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("admin_token", t);
  else localStorage.removeItem("admin_token");
}

export function getToken() {
  return token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message: string }).message)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: { role: string; email: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),

  overview: () => request<Record<string, unknown>>("/admin/overview"),
  users: (offset = 0) =>
    request<{ items: UserRow[]; count: number }>(
      `/admin/users?limit=50&offset=${offset}`,
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
};

export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  registrationPaid: boolean;
  createdAt: string;
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
  traderShare: string;
  walletAddress?: string;
  requestedAt: string;
  user: {
    displayName: string;
    email: string;
    kyc?: { status: string } | null;
  };
};
