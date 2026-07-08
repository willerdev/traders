// Browser uses same-origin proxy (app/api/v1/[...path]/route.ts) to avoid CORS.
const API_BASE = "/api/v1";

function networkErrorMessage(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "Cannot reach the API. Start the backend with: cd backend && npm run start:dev";
    }
  }
  return "Cannot reach the API. The server may be waking up — wait a moment and try again.";
}

function apiErrorMessage(body: unknown, statusText: string): string {
  if (body && typeof body === "object") {
    const msg = (body as { message?: unknown }).message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) {
      if (msg === "Unauthorized") {
        return "Your session expired — log out and sign in again, then retry.";
      }
      if (/validation failed/i.test(msg)) {
        return "That MT5 account is no longer available. Retrying with another pool account — if this persists, contact support.";
      }
      return msg;
    }
  }
  return statusText || "Request failed";
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("trp-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

class ApiClient {
  private token: string | null = readStoredToken();

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token ?? readStoredToken();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    const hasBody = options.body != null && options.body !== "";
    if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    } catch {
      throw new Error(networkErrorMessage());
    }

    if (!res.ok) {
      const text = await res.text();
      let error: { message?: unknown } = { message: res.statusText };
      try {
        if (text) error = JSON.parse(text) as { message?: unknown };
      } catch {
        throw new Error(
          text.slice(0, 120) || "Request failed — invalid server response",
        );
      }
      throw new Error(apiErrorMessage(error, res.statusText));
    }

    try {
      return await res.json();
    } catch {
      throw new Error("Invalid response from server — try again shortly");
    }
  }

  private isMissingRouteError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes("cannot post") || msg.includes("not found");
  }

  private async claimTradingAccountRequest(credentials: {
    accountName: string;
    login: string;
    password: string;
    server: string;
  }): Promise<{
    alreadyLinked: boolean;
    accountId: string;
    account: MetaApiAccountRow;
    settings?: UserSettings;
  }> {
    const options = {
      method: "POST" as const,
      body: JSON.stringify(credentials),
    };
    try {
      return await this.request<{
        alreadyLinked: boolean;
        accountId: string;
        account: MetaApiAccountRow;
        settings: UserSettings;
      }>("/users/trading-account/claim", options);
    } catch (err) {
      if (!this.isMissingRouteError(err)) throw err;
      return await this.request<{
        alreadyLinked: boolean;
        accountId: string;
        account: MetaApiAccountRow;
      }>("/mt5-sync/claim-account", options);
    }
  }

  auth = {
    register: (data: { email: string; password: string; displayName: string; acceptTerms: boolean; referralCode?: string }) =>
      this.request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      this.request<LoginResponse>(
        "/auth/login",
        { method: "POST", body: JSON.stringify(data) },
      ),
    verifyLoginOtp: (data: { loginSessionId: string; code: string }) =>
      this.request<{ accessToken: string; user: Record<string, unknown> }>(
        "/auth/login/verify-otp",
        { method: "POST", body: JSON.stringify(data) },
      ),
    resendLoginOtp: (data: { loginSessionId: string }) =>
      this.request<{ loginSessionId: string; message: string; expiresIn: number }>(
        "/auth/login/resend-otp",
        { method: "POST", body: JSON.stringify(data) },
      ),
    forgotPassword: (email: string) =>
      this.request<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      this.request<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),
    walletLogin: (data: { walletAddress: string; signature: string; message: string }) =>
      this.request<{ accessToken: string; user: Record<string, unknown> }>(
        "/auth/wallet",
        { method: "POST", body: JSON.stringify(data) },
      ),
  };

  users = {
    dashboard: () => this.request<DashboardData>("/users/dashboard"),
    profile: () => this.request("/users/profile"),
    settings: () => this.request<UserSettings>("/users/settings"),
    updateProfile: (data: UpdateProfileInput) =>
      this.request<UserSettings>("/users/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    updateAddress: (data: UpdateAddressInput) =>
      this.request<UserSettings>("/users/address", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    updatePaymentDetails: (data: UpdatePaymentDetailsInput) =>
      this.request<UserSettings>("/users/payment-details", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    updateTradingAccount: (metaApiAccountId: string | null) =>
      this.request<UserSettings>("/users/trading-account", {
        method: "PATCH",
        body: JSON.stringify({ metaApiAccountId }),
      }),
    claimTradingAccount: (credentials: {
      accountName: string;
      login: string;
      password: string;
      server: string;
    }) => this.claimTradingAccountRequest(credentials),
    getKyc: () => this.request<KycRecord>("/users/kyc"),
    submitKyc: (data: SubmitKycInput) =>
      this.request<KycRecord>("/users/kyc/submit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    retryKyc: () =>
      this.request<KycRecord>("/users/kyc/retry", { method: "POST" }),
  };

  signals = {
    submit: (data: SignalInput) =>
      this.request<
        | {
            status: "duplicate_signal";
            signalId: string;
            message: string;
            matchedSignal: MatchedDuplicateSignal;
          }
        | {
            status: "accepted";
            signalId: string;
            submittedAt: string;
            entryRange: { min: number; max: number };
            execution?: {
              status?: "pending" | "queued" | "failed";
              forwarded: boolean;
              hubError?: string;
              sendername?: string;
              orderType?: string;
            };
            executionHub?: {
              id: string;
              status: string;
              duplicate: boolean;
              progress?: { stage: string; message: string; executed: boolean };
            } | null;
            executionValidation?: {
              approved: boolean;
              adjusted: boolean;
              issues: string[];
              rejectReason?: string;
              sentPrices?: {
                symbol: string;
                direction: string;
                entry: number;
                sl: number;
                tp: number;
              };
            };
          }
      >("/signals", { method: "POST", body: JSON.stringify(data) }),
    hubHealth: () =>
      this.request<{
        configured: boolean;
        baseUrl: string;
        providerName: string;
        orderType: string;
        lotScale: number | null;
        keyHint?: string | null;
      }>("/signals/hub/health"),
    resendHub: (signalId: string) =>
      this.request<{
        status: string;
        signalId: string;
        submittedAt: string;
        entryRange: { min: number; max: number };
        execution?: {
          forwarded: boolean;
          hubError?: string;
          sendername?: string;
          orderType?: string;
        };
        executionHub?: {
          id: string;
          status: string;
          duplicate: boolean;
          progress?: { stage: string; message: string; executed: boolean };
        } | null;
        executionValidation?: {
          approved: boolean;
          adjusted: boolean;
          issues: string[];
          rejectReason?: string;
        };
      }>(`/signals/hub/resend/${signalId}`, { method: "POST" }),
    list: () => this.request<SignalRecord[]>("/signals"),
    get: (signalId: string) =>
      this.request<SignalDetailRecord>(`/signals/${signalId}`),
    warmupExecution: () =>
      this.request<{ ready: boolean; message?: string; accountId?: string }>(
        "/signals/execution/warmup",
      ),
    openUnresolved: () =>
      this.request<OpenSetupsResult>("/signals/open/unresolved"),
    claimableTps: () =>
      this.request<ClaimableTpsResult>("/signals/claimable/tps"),
    getResolution: (signalId: string) =>
      this.request<SetupResolution>(`/signals/${signalId}/resolution`),
    getLiveTrade: (signalId: string) =>
      this.request<{ signalId: string; liveTrade: SetupLiveTrade | null }>(
        `/signals/${signalId}/live-trade`,
      ),
    placeTrade: (signalId: string) =>
      this.request<PlaceTradeResult>(`/signals/${signalId}/place-trade`, {
        method: "POST",
      }),
    closeTrade: (signalId: string) =>
      this.request<CloseSetupTradeResult>(`/signals/${signalId}/close-trade`, {
        method: "POST",
      }),
    setBreakeven: (signalId: string) =>
      this.request<SetBreakevenResult>(`/signals/${signalId}/set-breakeven`, {
        method: "POST",
      }),
    partialClose: (signalId: string, volume: number) =>
      this.request<{ status: string; signalId: string; volume: number; message?: string }>(
        `/signals/${signalId}/partial-close`,
        { method: "POST", body: JSON.stringify({ volume }) },
      ),
    updateStops: (
      signalId: string,
      stops: { stopLoss?: number; takeProfit?: number },
    ) =>
      this.request<UpdateSetupStopsResult>(`/signals/${signalId}/update-stops`, {
        method: "POST",
        body: JSON.stringify(stops),
      }),
    metaApiAccounts: () =>
      this.request<MetaApiAccountsResult>("/signals/metaapi/accounts"),
    mt5Terminal: () => this.request<UserMt5Terminal>("/signals/mt5/terminal"),
    mt5Quotes: () =>
      this.request<UserMt5QuotesResult>("/signals/mt5/quotes"),
    mt5Running: () =>
      this.request<UserMt5RunningResult>("/signals/mt5/running"),
    closeMt5Position: (positionId: string) =>
      this.request<{ ok: boolean; positionId: string; status?: string }>(
        `/signals/mt5/positions/${encodeURIComponent(positionId)}/close`,
        { method: "POST" },
      ),
    closeAllMt5Positions: () =>
      this.request<CloseAllMt5Result>("/signals/mt5/positions/close-all", {
        method: "POST",
      }),
    copyDashboard: () =>
      this.request<CopyTradingDashboard>("/signals/metaapi/copy-dashboard"),
    claim: (
      signalId: string,
      outcome: "tp" | "sl",
      evidence?: {
        beforeScreenshotUrl: string;
        afterScreenshotUrl: string;
        tpClaimType?: "full" | "rr_1_1";
      },
    ) =>
      this.request<ClaimSetupResult>(`/signals/claim/${signalId}`, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          ...(evidence ?? {}),
        }),
      }),
    deleteLimit: (signalId: string) =>
      this.request<{
        status: string;
        signalId: string;
        cancelledMetaApi: boolean;
        hubWarning?: string;
        message: string;
      }>(`/signals/${signalId}/delete-limit`, { method: "POST" }),
    archive: (signalId: string) =>
      this.request<{ status: string; signalId: string }>(
        `/signals/archive/${signalId}`,
        { method: "POST" },
      ),
    archiveAll: () =>
      this.request<{ archivedCount: number; signalIds: string[] }>(
        "/signals/archive-all",
        { method: "POST" },
      ),
    archived: (limit = 50) =>
      this.request<{ items: ArchivedSetupItem[]; count: number }>(
        `/signals/archived/list?limit=${limit}`,
      ),
    invalidate: (signalId: string, reason?: string) =>
      this.request<InvalidateSetupResult>(`/signals/invalidate/${signalId}`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    executionStatus: (signalId: string) =>
      this.request<HubSignalStatus>(`/signals/hub/execution/${signalId}`),
    executionLogs: (params?: { signal_id?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.signal_id) q.set("signal_id", params.signal_id);
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return this.request<HubLogsResult>(
        `/signals/hub/logs${qs ? `?${qs}` : ""}`,
      );
    },
    hubList: (params?: {
      status?: string;
      limit?: number;
      offset?: number;
      since?: string;
      external_id?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.limit) q.set("limit", String(params.limit ?? 50));
      if (params?.offset) q.set("offset", String(params.offset));
      if (params?.since) q.set("since", params.since);
      if (params?.external_id) q.set("external_id", params.external_id);
      const qs = q.toString();
      return this.request<HubSignalList>(`/signals/hub/list${qs ? `?${qs}` : ""}`);
    },
    positions: () => this.request<HubPositions>("/signals/hub/positions"),
    closePosition: (ticket: number) =>
      this.request<{ ok: boolean; ticket: number }>(
        `/signals/hub/positions/${ticket}/close`,
        { method: "POST" },
      ),
    closeAllPositions: () =>
      this.request<{ ok: boolean; closed: number; count: number }>(
        "/signals/hub/positions/close-all",
        { method: "POST" },
      ),
    quote: (symbol: string) => {
      const q = new URLSearchParams({ symbol });
      return this.request<HubQuote>(`/signals/hub/quote?${q}`);
    },
    hubSignalById: (hubId: string) =>
      this.request<HubSignalStatus>(`/signals/hub/signals/${hubId}`),
    hubAction: (payload: HubActionInput) =>
      this.request<HubSignalStatus>("/signals/hub/action", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    listDrafts: () => this.request<SignalDraft[]>("/signals/drafts"),
    getDraft: (draftId: string) =>
      this.request<SignalDraft>(`/signals/drafts/${draftId}`),
    createDraft: (data: SignalDraftInput) =>
      this.request<SignalDraft>("/signals/drafts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateDraft: (draftId: string, data: SignalDraftInput) =>
      this.request<SignalDraft>(`/signals/drafts/${draftId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteDraft: (draftId: string) =>
      this.request<{ deleted: boolean }>(`/signals/drafts/${draftId}`, {
        method: "DELETE",
      }),
  };

  uploads = {
    setup: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/setup`, {
        method: "POST",
        headers,
        body: formData,
      }).catch(() => {
        throw new Error(networkErrorMessage());
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "Upload failed");
      }

      return res.json() as Promise<{ url: string; filename: string }>;
    },
    ingestSetup: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/setup/ingest`, {
        method: "POST",
        headers,
        body: formData,
      }).catch(() => {
        throw new Error(networkErrorMessage());
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "Upload failed");
      }

      return res.json() as Promise<{
        url: string;
        filename: string;
        analysis: SetupAnalysis;
      }>;
    },
    kyc: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/kyc`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "Upload failed");
      }

      return res.json() as Promise<{ url: string; filename: string }>;
    },
    analyzeSetup: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const res = await fetch(`${API_BASE}/uploads/setup/analyze`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(apiErrorMessage(error, res.statusText) || "AI analysis failed");
      }

      return res.json() as Promise<{ analysis: SetupAnalysis }>;
    },
  };

  assistant = {
    mt5Chat: (body: {
      message: string;
      history?: { role: "user" | "assistant"; content: string }[];
    }) =>
      this.request<Mt5AssistantReply>("/assistant/mt5/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };

  presence = {
    heartbeat: (path: string) =>
      this.request<{ ok: boolean }>("/presence/heartbeat", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  };

  messages = {
    getThread: (since?: string) => {
      const qs = since ? `?since=${encodeURIComponent(since)}` : "";
      return this.request<DirectMessageThread>(`/messages${qs}`);
    },
    send: (body: string) =>
      this.request<SendMessageResult>("/messages", {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    requestAdmin: () =>
      this.request<RequestAdminResult>("/messages/request-admin", {
        method: "POST",
      }),
    unreadCount: () =>
      this.request<{ count: number }>("/messages/unread-count"),
  };

  leaderboard = {
    get: (week?: number, year?: number) => {
      const params = new URLSearchParams();
      if (week) params.set("week", String(week));
      if (year) params.set("year", String(year));
      return this.request<LeaderboardEntry[]>(`/leaderboard?${params}`);
    },
    hubExecution: (params?: {
      days?: number;
      min_closed_trades?: number;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.days) q.set("days", String(params.days));
      if (params?.min_closed_trades !== undefined) {
        q.set("min_closed_trades", String(params.min_closed_trades));
      }
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return this.request<HubSenderReport>(
        `/leaderboard/hub-execution${qs ? `?${qs}` : ""}`,
      );
    },
  };

  public = {
    recentPayouts: (limit = 12) =>
      this.request<PublicPayoutFeed>(
        `/public/recent-payouts?limit=${limit}`,
      ),
  };

  payments = {
    pendingRegistration: (network?: string) =>
      this.request<{
        pending: {
          paymentId: string;
          amount: number;
          currency: string;
          network: string;
          payAddress?: string;
          payAmount?: number;
          payCurrency?: string;
          gatewayPaymentId?: number;
          liveStatus?: string;
          gateway?: string;
          orderId?: string;
        } | null;
      }>(
        `/payments/registration/pending${
          network ? `?network=${encodeURIComponent(network)}` : ""
        }`,
      ),
    createRegistration: (
      network: string,
      promoCode?: string,
      source?: "wallet" | "crypto",
    ) =>
      this.request<{
        paymentId?: string;
        amount?: number;
        currency?: string;
        network?: string;
        payAddress?: string;
        payAmount?: number;
        payCurrency?: string;
        gatewayPaymentId?: number;
        liveStatus?: string;
        invoiceUrl?: string;
        gateway?: string;
        success?: boolean;
        message?: string;
        promoCode?: string;
        amountCharged?: number;
        source?: string;
        balanceAfter?: number;
        accessExpiresAt?: string;
      }>("/payments/registration", {
        method: "POST",
        body: JSON.stringify({ network, promoCode, source }),
      }),
    getStatus: (paymentId: string) =>
      this.request<{
        payment: { id: string; status: string; amount: number };
        liveStatus?: string;
        actuallyPaid?: number;
        payAmount?: number;
        payAddress?: string;
        progress: string;
        confirmed: boolean;
      }>(`/payments/${paymentId}/status`),
    applyPromo: (code: string) =>
      this.request<{
        success?: boolean;
        alreadyPaid?: boolean;
        message: string;
        promoCode?: string;
        discountPercent?: number;
        amountCharged?: number;
      }>("/payments/apply-promo", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    featuredPromo: () =>
      this.request<{
        registrationFeeUsdt: number;
        promo: {
          code: string;
          discountPercent: number;
          description: string;
          originalAmount: number;
          finalAmount: number;
          expiresAt: string;
        } | null;
      }>("/payments/promo/featured"),
    validatePromo: (code: string) =>
      this.request<{
        valid: boolean;
        code: string;
        discountPercent: number;
        description: string;
        originalAmount: number;
        finalAmount: number;
        freeRegistration: boolean;
      }>(`/payments/promo/validate?code=${encodeURIComponent(code)}`),
    history: () => this.request("/payments/history"),
    wallet: () => this.request<WalletTransaction[]>("/payments/wallet"),
    createProfitShare: (network: string) =>
      this.request<{
        paymentId?: string;
        amount?: number;
        currency?: string;
        network?: string;
        payAddress?: string;
        payAmount?: number;
        payCurrency?: string;
        gatewayPaymentId?: number;
        liveStatus?: string;
        gateway?: string;
        message?: string;
        active?: boolean;
        enrolledAt?: string | null;
      }>("/payments/profit-share", {
        method: "POST",
        body: JSON.stringify({ network }),
      }),
    profitShareStatus: () =>
      this.request<ProfitShareStatus>("/payments/profit-share/status"),
    createMt5Sync: (network: string) =>
      this.request<{
        paymentId?: string;
        amount?: number;
        currency?: string;
        network?: string;
        payAddress?: string;
        payAmount?: number;
        payCurrency?: string;
        gatewayPaymentId?: number;
        liveStatus?: string;
        gateway?: string;
        message?: string;
      }>("/payments/mt5-sync", {
        method: "POST",
        body: JSON.stringify({ network }),
      }),
    mt5SyncStatus: () =>
      this.request<Mt5SyncStatus>("/payments/mt5-sync/status"),
  };

  wallet = {
    summary: () => this.request<WalletSummary>("/wallet/summary"),
    transactions: (take = 50, skip = 0) =>
      this.request<{ items: WalletLedgerItem[]; total: number }>(
        `/wallet/transactions?take=${take}&skip=${skip}`,
      ),
    depositMinimum: (network: string) =>
      this.request<{ minUsdt: number; network: string }>(
        `/wallet/deposit/minimum?network=${encodeURIComponent(network)}`,
      ),
    previewDeposit: (amount: number, riskPercent: number) =>
      this.request<DepositorPlanPreview>(
        `/wallet/deposit/preview?amount=${amount}&riskPercent=${riskPercent}`,
      ),
    deposit: (data: {
      network: string;
      amount: number;
      riskPercent?: number;
    }) =>
      this.request<WalletDepositCheckout>("/wallet/deposit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    createPlan: (amount: number, riskPercent: number) =>
      this.request<DepositorPlanPreview>("/wallet/deposit/plan", {
        method: "POST",
        body: JSON.stringify({ amount, riskPercent }),
      }),
    withdraw: (amount: number, walletAddress?: string) =>
      this.request<{
        status: string;
        payoutId: string;
        amount: number;
        balance: number;
      }>("/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({
          amount,
          ...(walletAddress?.trim()
            ? { walletAddress: walletAddress.trim() }
            : {}),
        }),
      }),
  };

  investor = {
    status: () => this.request<InvestorStatus>("/investor/status"),
    enrollCheckout: (network: string, source?: "wallet" | "crypto") =>
      this.request<InvestorCheckout>("/investor/enroll/checkout", {
        method: "POST",
        body: JSON.stringify({ network, source }),
      }),
    updateSettings: (riskPercent: number) =>
      this.request<{ riskPercent: number; paused: boolean }>(
        "/investor/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ riskPercent }),
        },
      ),
    pause: () =>
      this.request<{ paused: boolean }>("/investor/pause", { method: "POST" }),
    resume: () =>
      this.request<{ paused: boolean }>("/investor/resume", {
        method: "POST",
      }),
  };

  mt5Sync = {
    setEnabled: (enabled: boolean) =>
      this.request<Mt5SyncStatus>("/mt5-sync/enabled", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    status: () => this.request<Mt5SyncStatus>("/mt5-sync/status"),
    poolAccounts: () =>
      this.request<MetaApiAccountsResult>("/mt5-sync/pool-accounts"),
    claimAccount: (credentials: {
      accountName: string;
      login: string;
      password: string;
      server: string;
    }) => this.claimTradingAccountRequest(credentials),
  };

  tpClaims = {
    list: () => this.request<TpClaimRecord[]>("/tp-claims"),
    resubmit: (
      claimId: string,
      evidence: { beforeScreenshotUrl: string; afterScreenshotUrl: string },
    ) =>
      this.request<ClaimSetupResult>(`/tp-claims/${claimId}/resubmit`, {
        method: "POST",
        body: JSON.stringify(evidence),
      }),
    requestPayout: (claimId: string, walletAddress?: string) =>
      this.request<{
        status: string;
        payoutId: string;
        amount: number;
        claimId: string;
        symbol: string;
      }>(`/tp-claims/${claimId}/request-payout`, {
        method: "POST",
        body: JSON.stringify(
          walletAddress?.trim() ? { walletAddress: walletAddress.trim() } : {},
        ),
      }),
  };

  payouts = {
    history: () => this.request<PayoutRecord[]>("/payouts"),
    rewardTier: () => this.request<PayoutRewardStatus>("/payouts/reward-tier"),
    request: (payoutId: string, walletAddress?: string) =>
      this.request("/payouts/request", {
        method: "POST",
        body: JSON.stringify(
          walletAddress?.trim()
            ? { payoutId, walletAddress: walletAddress.trim() }
            : { payoutId },
        ),
      }),
    withdrawProfitShare: (walletAddress?: string) =>
      this.request<{
        status: string;
        payoutId: string;
        amount: number;
        source: string;
      }>("/payouts/profit-share/withdraw", {
        method: "POST",
        body: JSON.stringify(
          walletAddress?.trim() ? { walletAddress: walletAddress.trim() } : {},
        ),
      }),
  };

  notifications = {
    list: (limit?: number) =>
      this.request<PlatformNotificationsResult>(
        `/notifications${limit ? `?limit=${limit}` : ""}`,
      ),
    markRead: (id: string) =>
      this.request<{ ok: boolean }>(`/notifications/${id}/read`, {
        method: "PATCH",
      }),
    markAllRead: () =>
      this.request<{ ok: boolean }>("/notifications/read-all", {
        method: "PATCH",
      }),
  };

  referrals = {
    me: () => this.request<ReferralInfo>("/referrals/me"),
  };

  admin = {
    overview: () => this.request<AdminOverview>("/admin/overview"),
    pendingKyc: () => this.request<AdminKycItem[]>("/admin/kyc/pending"),
    approveKyc: (userId: string) =>
      this.request(`/admin/kyc/${userId}/approve`, { method: "POST" }),
    rejectKyc: (userId: string, reason: string) =>
      this.request(`/admin/kyc/${userId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    pendingPayouts: () => this.request<AdminPayoutItem[]>("/admin/payouts/pending"),
    approvePayout: (payoutId: string) =>
      this.request(`/admin/payouts/${payoutId}/approve`, { method: "POST" }),
  };
}

export interface ReferralInfo {
  code: string;
  link: string;
  rewards: { kycRewardUsdt: number; paidRewardUsdt: number };
  totalEarnedUsdt: number;
  totalReferred: number;
  referrals: Array<{
    displayName: string;
    joinedAt: string;
    kycCompleted: boolean;
    subscribed: boolean;
    kycRewarded: boolean;
    paidRewarded: boolean;
  }>;
}

export interface LoginStartResponse {
  requiresOtp: true;
  loginSessionId: string;
  email: string;
  message: string;
  expiresIn: number;
}

export interface LoginCompleteResponse {
  accessToken: string;
  user: Record<string, unknown>;
}

export type LoginResponse = LoginStartResponse | LoginCompleteResponse;

export interface PayoutRecord {
  id: string;
  virtualProfit: number;
  traderShare: number;
  platformShare: number;
  status: string;
  source?: "WEEKLY" | "TP_REWARD";
  rewardTier?: string | null;
  payoutMethod?: "TRC20" | "MOBILE_MONEY" | null;
  weekNumber: number;
  year: number;
  walletAddress?: string | null;
  notes?: string | null;
  requestedAt: string;
}

export interface PayoutRewardTierDef {
  id: "STARTER" | "PRO" | "ELITE";
  label: string;
  amountUsdt: number;
  winsMin: number;
  winsMax: number;
  requirement: string;
}

export interface PayoutRewardStatus {
  windowSize: number;
  resolved: number;
  wins: number;
  losses: number;
  currentTierId: "STARTER" | "PRO" | "ELITE";
  currentTierLabel: string;
  currentRewardUsdt: number;
  nextTierId: "PRO" | "ELITE" | null;
  winsToNextTier: number;
  tiers: PayoutRewardTierDef[];
  recentResults: ("W" | "L")[];
  weeklyPayoutsEnabled?: boolean;
}

export interface PublicPayoutHighlight {
  displayName: string;
  amount: number;
  tier: string;
  source: string;
  rewardTier: string | null;
  weekNumber: number;
  year: number;
  paidAt: string;
}

export interface PublicPayoutFeed {
  items: PublicPayoutHighlight[];
  totalPaid: number;
  payoutCount: number;
  refreshedAt: string;
}

export interface ProfitShareStatus {
  active: boolean;
  enrolledAt: string | null;
  balance: number;
  lifetimeEarned: number;
  sharePercent: number;
  feeUsdt: number;
  withdrawThreshold: number;
  withdrawThresholdPercent: number;
  canWithdraw: boolean;
  amountToWithdraw: number;
  remainingToWithdraw: number;
  initialInvestmentBasis: number;
}

export interface Mt5SyncStatus {
  active: boolean;
  enabled: boolean;
  enrolledAt: string | null;
  expiresAt: string | null;
  linkedAccountId: string | null;
  openLinks: number;
  lastSyncedAt?: string | null;
  feeUsdt?: number;
  latestPayment?: {
    id: string;
    status: string;
    amount: number;
    confirmedAt: string | null;
  } | null;
}

export interface DashboardData {
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    email: string;
    role: string;
    status: string;
    emailVerified?: boolean;
    registrationPaid?: boolean;
    accessExpiresAt?: string | null;
    tradingAccessActive?: boolean;
    tradingDaysRemaining?: number | null;
  };
  onboarding?: OnboardingStatus;
  account: {
    balance: number;
    tier: string;
    weeklyProfit: number;
    winRate: number;
    score: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    maxDrawdown: number;
    currentDrawdown: number;
    totalProfit: number;
  } | null;
  rank: number | null;
  tier: string;
  recentSignals: SignalRecord[];
  walletTransactions: WalletTransaction[];
  payoutReward?: PayoutRewardStatus;
  profitShare?: ProfitShareStatus;
}

export interface OnboardingStatus {
  emailVerified: boolean;
  registrationPaid: boolean;
  accountActive: boolean;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  profileComplete: boolean;
  addressComplete: boolean;
  hasSubmittedSignal: boolean;
}

export interface AdminOverview {
  activeTraders: number;
  totalUsers: number;
  todayRegistrations: number;
  totalRevenue: number;
  pendingKycCount: number;
  pendingPayouts: { count: number; amount: number };
}

export interface AdminKycItem {
  id: string;
  userId: string;
  status: string;
  documentType: string | null;
  documentFrontUrl: string | null;
  selfieUrl: string | null;
  submittedAt: string | null;
  user: {
    id: string;
    email: string | null;
    displayName: string;
    profile: UserProfileRecord | null;
  };
}

export interface AdminPayoutItem {
  id: string;
  traderShare: number;
  virtualProfit: number;
  walletAddress: string | null;
  status: string;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    kyc: { status: string } | null;
  };
}

export interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  referenceId: string | null;
  description: string;
  balanceAfter: number | null;
  createdAt: string;
}

export interface WalletSummary {
  availableBalance: number;
  lockedBalance: number;
  subscriptionPaid: number;
  totalDeposited: number;
  totalEarned: number;
  totalWithdrawn: number;
  platformDailyYieldPercent: number;
  minDepositUsdt: number;
  activePlan: {
    id: string;
    amount: number;
    riskPercent: number;
    dailyYieldPercent: number;
    startAt: string;
    endAt: string;
    status: string;
    credits: Array<{ dayIndex: number; amount: number; creditedAt: string }>;
  } | null;
}

export interface WalletLedgerItem {
  id: string;
  amount: number;
  type: string;
  description: string;
  referenceId: string | null;
  balanceAfter: number | null;
  createdAt: string;
}

export interface DepositorPlanPreview {
  amount: number;
  riskPercent: number;
  maxLossPerDay: number;
  maxGainPerDay: number;
  rr: string;
  planDays: number;
  dailyYieldPercent: number;
  projectedDailyEarning: number;
  projectedTotalEarning: number;
  days: Array<{
    day: number;
    maxLoss: number;
    maxGain: number;
    projectedEarning?: number;
  }>;
}

export interface WalletDepositCheckout {
  paymentId: string;
  amount: number;
  currency: string;
  network: string;
  payAddress?: string;
  payAmount?: number;
  payCurrency?: string;
  gatewayPaymentId?: number;
  liveStatus?: string;
}

export interface InvestorStatus {
  active: boolean;
  enrolledAt: string | null;
  feeUsdt: number;
  mt5Linked: boolean;
  mt5Connected: boolean;
  mt5HealthMessage: string | null;
  settings: {
    riskPercent: number;
    useTwoToOneRr: boolean;
    paused: boolean;
  } | null;
  recentTrades: Array<{
    id: string;
    signalId: string;
    symbol: string;
    direction: string;
    status: string;
    profit: number | null;
    notes: string | null;
    executedAt: string | null;
    closedAt: string | null;
  }>;
}

export interface InvestorCheckout {
  paymentId?: string;
  amount?: number;
  currency?: string;
  network?: string;
  payAddress?: string;
  payAmount?: number;
  payCurrency?: string;
  gatewayPaymentId?: number;
  liveStatus?: string;
  message?: string;
  active?: boolean;
  enrolledAt?: string | null;
  success?: boolean;
  source?: string;
  balanceAfter?: number;
}

export interface SignalRecord {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  status: string;
  submittedAt: string;
  pointsAwarded: number;
  screenshotUrl?: string;
}

export interface SignalDetailRecord extends SignalRecord {
  metaApiOrderId?: string | null;
  metaApiPositionId?: string | null;
  metaApiExecutedAt?: string | null;
  hubRecordId?: string | null;
}

export interface MatchedDuplicateSignal {
  signalId: string;
  traderName: string;
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  submittedAt: string;
  pipDistance: number;
}

export interface SignalInput {
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  description: string;
  screenshotUrl: string;
}

export interface ArchivedSetupItem {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  status: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  submittedAt: string;
  resolvedAt: string | null;
}

export interface HubQuote {
  symbol: string;
  resolved_symbol: string;
  bid: number;
  ask: number;
  price: number;
  mid: number;
  spread: number;
  time: string;
  source?: string;
}

export interface SetupAnalysis {
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  description: string;
}

export interface SignalDraftInput {
  symbol?: string;
  direction?: "BUY" | "SELL";
  entryMin?: number;
  entryMax?: number;
  stopLoss?: number;
  takeProfit?: number;
  description?: string;
  screenshotUrl?: string;
  aiFilled?: boolean;
}

export interface SignalDraft {
  id: string;
  symbol: string | null;
  direction: "BUY" | "SELL" | null;
  entryMin: number | null;
  entryMax: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  description: string | null;
  screenshotUrl: string | null;
  aiFilled: boolean;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  user: {
    id: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    walletAddress: string | null;
    metaApiAccountId?: string | null;
    createdAt: string;
    tier: string;
  };
  profile: UserProfileRecord | null;
  kyc: KycRecord;
  metaApi?: {
    configured: boolean;
    defaultAccountId: string | null;
  };
}

export interface UserProfileRecord {
  id: string;
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
  payoutMethod?: "TRC20" | "MOBILE_MONEY" | null;
  trc20Address?: string | null;
  mobileMoneyProvider?: string | null;
  mobileMoneyNumber?: string | null;
  mobileMoneyAccountName?: string | null;
}

export interface KycRecord {
  id?: string;
  status: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  documentType?: "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE" | null;
  documentNumber?: string | null;
  documentFrontUrl?: string | null;
  documentBackUrl?: string | null;
  selfieUrl?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

export interface UpdateProfileInput {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface UpdateAddressInput {
  country?: string;
  state?: string;
  city?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
}

export interface UpdatePaymentDetailsInput {
  payoutMethod: "TRC20" | "MOBILE_MONEY";
  trc20Address?: string;
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  mobileMoneyAccountName?: string;
}

export interface SubmitKycInput {
  documentType: "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";
  documentNumber: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfieUrl: string;
}

export interface LeaderboardEntry {
  id: string;
  userId: string;
  displayName: string;
  tier: string;
  rank: number;
  score: number;
  profit: number;
  winRate: number;
  drawdown: number;
  consistency: number;
}

export interface HubSignalStatus {
  id: string;
  external_id: string | null;
  status: string;
  duplicate: boolean;
  progress?: { stage: string; message: string; executed: boolean } | null;
  created_at?: string;
  acked_at?: string | null;
}

export interface HubSignalList {
  items: HubSignalStatus[];
  count: number;
  sendername?: string | null;
}

export interface HubLogEvent {
  id: string;
  signal_id: string | null;
  sendername: string | null;
  event: string;
  message: string;
  created_at: string;
}

export interface HubLogsResult {
  items: HubLogEvent[];
  count: number;
  sendername?: string | null;
}

export interface HubPosition {
  ticket?: number;
  symbol?: string;
  type?: string;
  volume?: number;
  price_open?: number;
  sl?: number;
  tp?: number;
  profit?: number;
}

export interface HubPositions {
  sendername: string;
  count: number;
  items: HubPosition[];
}

export type HubActionType =
  | "open"
  | "add"
  | "close"
  | "breakeven"
  | "modify"
  | "partial_close"
  | "close_all"
  | "ignore";

export interface HubActionInput {
  action: HubActionType;
  symbol?: string;
  direction?: "buy" | "sell";
  entry?: number;
  sl?: number;
  tp?: number;
  lot?: number;
  ticket?: number;
  external_id?: string;
  message?: string;
}

export interface HubSenderStat {
  rank?: number;
  sendername?: string;
  sender?: string;
  signals?: number;
  executed?: number;
  skipped?: number;
  failed?: number;
  closed_trades?: number;
  wins?: number;
  losses?: number;
  win_rate?: number;
  net_profit?: number;
  profit?: number;
  gross_profit?: number;
  gross_loss?: number;
  profit_factor?: number;
  expectancy?: number;
  profitable?: boolean;
}

export interface HubSenderReport {
  days: number;
  sort?: string;
  min_closed_trades?: number;
  total_senders: number;
  returned: number;
  generated_at?: string | null;
  senders: HubSenderStat[];
}

export interface DirectMessage {
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
}

export interface DirectMessageThread {
  userId: string;
  messages: DirectMessage[];
  unreadCount: number;
  agentEnabled: boolean;
  escalatedAt: string | null;
}

export interface SendMessageResult {
  message: DirectMessage;
  replies?: DirectMessage[];
  agentEnabled: boolean;
  escalated?: boolean;
}

export interface RequestAdminResult {
  agentEnabled: boolean;
  escalated: boolean;
  reply: DirectMessage;
}

export type SetupExecutionPhase =
  | "not_opened"
  | "limit_active"
  | "running"
  | "partial"
  | "claimable"
  | "closed_win"
  | "closed_loss"
  | "closed_neutral"
  | "closed";

export type TradeProgressOutcome = "win" | "loss" | "neutral";

export interface SetupResolution {
  signalId: string;
  symbol?: string;
  direction?: string;
  status: string;
  takeProfit?: number;
  stopLoss?: number;
  entryMin?: number;
  entryMax?: number;
  oneToOnePrice?: number;
  riskRewardRatio?: number;
  activated?: boolean;
  tradeOpened?: boolean;
  partialClosed?: boolean;
  executionPhase?: SetupExecutionPhase;
  executionLabel?: string;
  tradeProgressOutcome?: TradeProgressOutcome | null;
  resolvedAt?: string | null;
  exitPrice?: number | null;
  pnl?: number | null;
  pointsAwarded?: number;
  tp1ClaimBlockedReason?: string;
  currentPrice?: number | null;
  priceOutcome?: "tp" | "sl" | null;
  hubStatus?: string | null;
  hubOutcome?: "tp" | "sl" | null;
  pendingTpClaim?: boolean;
  claimable: boolean;
  canClaimTp: boolean;
  canClaimTp1R1?: boolean;
  canClaimSl: boolean;
  reason?: string;
  metaApiExecuted?: boolean;
  metaApiOrderId?: string | null;
  metaApiPositionId?: string | null;
  canPlaceTrade?: boolean;
  canCloseTrade?: boolean;
  metaApiPrice?: number | null;
  liveTrade?: SetupLiveTrade | null;
  canInvalidate?: boolean;
  invalidateBlockedReason?: string;
  tp1Reached?: boolean;
  breakevenSet?: boolean;
  breakevenPending?: boolean;
  breakevenRetryCount?: number;
  canSetBreakeven?: boolean;
  canAdjustStops?: boolean;
}

export interface SetupLiveTrade {
  status: "open" | "pending" | "none";
  positionId?: string;
  orderId?: string;
  openPrice?: number;
  currentPrice?: number;
  volume?: number;
  profit?: number;
  unrealizedProfit?: number;
  swap?: number;
  commission?: number;
  currency?: string;
  symbol?: string;
  comment?: string;
  stopLoss?: number;
  takeProfit?: number;
  tp1Price?: number;
  tp1Reached?: boolean;
  entryPrice?: number;
  canClose?: boolean;
}

export interface CloseSetupTradeResult {
  status: string;
  signalId: string;
  exitPrice?: number;
  outcome?: "tp" | "even" | "sl";
  fullTp?: boolean;
  tp1Price?: number;
  pointsAwarded?: number;
  message?: string;
}

export interface SetBreakevenResult {
  status: "set" | "pending" | "already_set" | "exhausted";
  applied: boolean;
  breakevenPrice?: number;
  retriesUsed: number;
  retriesRemaining: number;
  message: string;
}

export interface UpdateSetupStopsResult {
  status: string;
  signalId: string;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  metaApiUpdated: boolean;
  hubUpdated: boolean;
  brokerStopLoss?: number | null;
  brokerTakeProfit?: number | null;
  message: string;
}

export interface MetaApiAccountRow {
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
}

export interface MetaApiAccountsResult {
  configured: boolean;
  count: number;
  items: MetaApiAccountRow[];
}

export interface CopyTradingLeader {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  tier: string;
  winRate: number;
  profit: number;
}

export interface CopyTradeJournalEntry {
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
}

export interface CopyTradingDashboard {
  configured: boolean;
  copyAccountId: string | null;
  message?: string;
  riskPercent?: number;
  leaders: CopyTradingLeader[];
  terminal: {
    configured: boolean;
    accountId: string | null;
    information: {
      balance: number;
      equity: number;
      currency: string;
      margin: number;
      freeMargin: number;
      leverage: number;
      tradeAllowed: boolean;
    } | null;
    positions: Array<{
      id: string;
      symbol: string;
      type: string;
      volume: number;
      openPrice: number;
      currentPrice: number;
      stopLoss?: number;
      takeProfit?: number;
      profit: number;
      unrealizedProfit: number;
      swap: number;
      commission: number;
      comment?: string;
    }>;
    error?: string;
  } | null;
  journal: CopyTradeJournalEntry[];
  stats: {
    openCount: number;
    closedCount: number;
    totalRealizedProfit: number;
    floatingProfit: number;
  };
}

export interface UserMt5Trade {
  signalId: string | null;
  symbol: string;
  direction: string;
  kind: "limit" | "running";
  status: "pending" | "open";
  entryMin?: number;
  entryMax?: number;
  stopLoss?: number;
  takeProfit?: number;
  volume?: number;
  openPrice?: number;
  currentPrice?: number;
  profit?: number;
  orderId?: string;
  positionId?: string;
  orderType?: string;
  canClose: boolean;
  canSetBreakeven?: boolean;
  breakevenSet?: boolean;
  canPartialClose?: boolean;
  executionLabel?: string;
}

export interface UserMt5RunningResult {
  trades: UserMt5Trade[];
  account?: UserMt5AccountSummary;
  stats: {
    runningCount: number;
    floatingProfit: number;
  };
  refreshedAt: string;
}

export interface UserMt5HistoryItem {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  status: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number | null;
  isWin: boolean | null;
  submittedAt: string;
  closedAt: string;
}

export interface UserMt5QuoteItem {
  signalId: string;
  symbol: string;
  direction: string;
  entryMin: number;
  entryMax: number;
  entryMid: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread: number | null;
  change: number | null;
  changePct: number | null;
  time: string | null;
  submittedAt: string;
}

export interface UserMt5QuotesResult {
  items: UserMt5QuoteItem[];
  refreshedAt: string;
}

export interface CloseAllMt5Result {
  ok: boolean;
  closed: number;
  failed: number;
  total: number;
  results: {
    symbol: string;
    signalId?: string | null;
    positionId?: string;
    status: string;
    error?: string;
  }[];
  refreshedAt: string;
}

export interface Mt5AssistantReply {
  reply: string;
  actionsTaken: string[];
  configured: boolean;
}

export interface UserMt5AccountSummary {
  startingBalance: number;
  currency: string;
  realizedProfit: number;
  floatingProfit: number;
  totalProfit: number;
  equity: number;
}

export interface UserMt5Terminal {
  configured: boolean;
  message?: string;
  account?: UserMt5AccountSummary;
  setups: {
    items: OpenSetupItem[];
    count: number;
    claimableCount: number;
  };
  trades: UserMt5Trade[];
  history: {
    items: UserMt5HistoryItem[];
    count: number;
  };
  stats: {
    openSetupCount: number;
    limitCount: number;
    runningCount: number;
    floatingProfit: number;
    historyCount: number;
  };
  refreshedAt: string;
}

export interface PlaceTradeResult {
  status: string;
  signalId: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  pending: boolean;
  orderKind?: string;
  quote: { symbol: string; bid: number; ask: number; time: string };
  risk: {
    volume: number;
    riskPercent: number;
    riskAmount: number;
    estimatedLossAtSl: number;
    accountEquity: number;
    currency: string;
    aiManaged: boolean;
    notes: string[];
  };
  metaApi: {
    accountId: string;
    accountName: string;
    orderId?: string;
    positionId?: string;
    message: string;
    comment?: string;
    orderKind?: string;
  };
}

export interface OpenSetupItem {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  submittedAt: string;
  activated: boolean;
  resolution: SetupResolution;
  liveTrade?: SetupLiveTrade | null;
}

export interface OpenSetupsResult {
  items: OpenSetupItem[];
  count: number;
  claimableCount: number;
}

export interface ClaimableTpSetup {
  signalId: string;
  symbol: string;
  direction: string;
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  submittedAt: string;
  oneToOnePrice?: number;
  currentPrice?: number | null;
  canClaimFullTp: boolean;
  canClaimTp1R1: boolean;
  claimable: boolean;
  executionPhase?: SetupExecutionPhase;
  executionLabel?: string;
  breakevenSet?: boolean;
  tp1ClaimBlockedReason?: string;
}

export interface ClaimableTpsResult {
  items: ClaimableTpSetup[];
  count: number;
}

export interface PlatformNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  signalId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface PlatformNotificationsResult {
  unreadCount: number;
  items: PlatformNotification[];
}

export interface ClaimSetupResult {
  status: string;
  signalId: string;
  message?: string;
  claimId?: string;
  outcome?: "tp" | "sl";
  exitPrice?: number;
  reward?: number;
  pointsAwarded?: number;
}

export interface InvalidateSetupResult {
  status: "cancelled" | "archived";
  signalId: string;
  hub?: {
    id: string;
    status: string;
    ok?: boolean;
    duplicate?: boolean;
    progress?: { stage: string; message: string; executed: boolean };
  } | null;
  hubNotFound?: boolean;
  hubWarning?: string;
}

export interface TpClaimRecord {
  id: string;
  signalId: string;
  symbol: string;
  direction: string;
  exitPrice: number;
  beforeScreenshotUrl: string;
  afterScreenshotUrl: string;
  claimType?: "FULL_TP" | "RR_1_TO_1";
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  adminNote?: string | null;
  reviewedAt?: string | null;
  submittedAt: string;
  updatedAt: string;
  rewardAmount?: number;
  canRequestPayout?: boolean;
  payout?: {
    id: string;
    status: string;
    walletAddress?: string | null;
    amount: number;
    requestedAt: string;
  } | null;
  setup?: {
    entryMin: number;
    entryMax: number;
    stopLoss: number;
    takeProfit: number;
    signalStatus: string;
  };
  canResubmit?: boolean;
}

export const api = new ApiClient();
