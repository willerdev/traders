import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type IncomeJournalEntry,
  type InvestorDepositorSettings,
  type InvestorRow,
} from "./api";

type Section = "overview" | "investors" | "income" | "tools";

function fmtMoney(n: number | string) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

type Props = {
  onMessage: (msg: string) => void;
};

export function InvestorDepositorPlatform({ onMessage }: Props) {
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("overview");
  const [settings, setSettings] = useState<InvestorDepositorSettings | null>(null);
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [incomeJournal, setIncomeJournal] = useState<IncomeJournalEntry[]>([]);

  const [investorYield, setInvestorYield] = useState("");
  const [depositorYield, setDepositorYield] = useState("");
  const [minDeposit, setMinDeposit] = useState("");
  const [loginOtpEnabled, setLoginOtpEnabled] = useState(false);
  const [investorYieldPaused, setInvestorYieldPaused] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [yieldDrafts, setYieldDrafts] = useState<Record<string, string>>({});
  const [transferDrafts, setTransferDrafts] = useState<Record<string, string>>({});
  const [journalSource, setJournalSource] = useState<"" | "INVESTOR" | "DEPOSITOR">("");

  const [creditEmail, setCreditEmail] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);
  const [broadcastSaving, setBroadcastSaving] = useState(false);

  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrollAmount, setEnrollAmount] = useState("100");
  const [enrollSource, setEnrollSource] = useState<"wallet" | "comp">("comp");
  const [enrollNote, setEnrollNote] = useState("");
  const [enrollSaving, setEnrollSaving] = useState(false);

  const [systemSymbol, setSystemSymbol] = useState("EURUSD");
  const [systemDirection, setSystemDirection] = useState<"BUY" | "SELL">("BUY");
  const [systemEntryMin, setSystemEntryMin] = useState("1.0850");
  const [systemEntryMax, setSystemEntryMax] = useState("1.0860");
  const [systemSl, setSystemSl] = useState("1.0820");
  const [systemPublishing, setSystemPublishing] = useState(false);
  const [systemPublishResult, setSystemPublishResult] = useState<string | null>(null);

  const applySettings = useCallback((s: InvestorDepositorSettings) => {
    setSettings(s);
    setInvestorYield(String(s.investorDailyYieldPercent));
    setDepositorYield(String(s.depositorDailyYieldPercent));
    setMinDeposit(String(s.depositorMinDepositUsdt));
    setLoginOtpEnabled(s.loginOtpEnabled);
    setInvestorYieldPaused(Boolean(s.investorYieldPaused));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, investorList, journal] = await Promise.all([
        api.investorDepositorSettings(),
        api.listInvestors({ limit: 50 }),
        api.incomeJournal({ limit: 50 }),
      ]);
      applySettings(s);
      setInvestors(investorList.items);
      setYieldDrafts(
        Object.fromEntries(
          investorList.items.map((i) => [
            i.id,
            i.dailyYieldPercent != null ? String(i.dailyYieldPercent) : "",
          ]),
        ),
      );
      setIncomeJournal(journal.items);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not load platform data");
    } finally {
      setLoading(false);
    }
  }, [applySettings, onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const totalWallet = investors.reduce((sum, i) => sum + i.walletBalance, 0);
    const totalInvestment = investors.reduce(
      (sum, i) => sum + (i.investmentBalance ?? 0),
      0,
    );
    const investorIncome = incomeJournal
      .filter((e) => e.source === "INVESTOR")
      .reduce((sum, e) => sum + e.amount, 0);
    const depositorIncome = incomeJournal
      .filter((e) => e.source === "DEPOSITOR")
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      investorCount: investors.length,
      totalWallet,
      totalInvestment,
      investorIncome,
      depositorIncome,
      journalCount: incomeJournal.length,
    };
  }, [investors, incomeJournal]);

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      const updated = await api.updateInvestorDepositorSettings({
        investorDailyYieldPercent: Number(investorYield),
        investorYieldPaused,
        depositorDailyYieldPercent: Number(depositorYield),
        depositorMinDepositUsdt: Number(minDeposit),
        loginOtpEnabled,
      });
      applySettings(updated);
      onMessage("Platform settings saved.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function refreshJournal() {
    try {
      const journal = await api.incomeJournal({
        limit: 50,
        source: journalSource || undefined,
      });
      setIncomeJournal(journal.items);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not refresh journal");
    }
  }

  const sections: { id: Section; label: string; hint: string }[] = [
    { id: "overview", label: "Overview", hint: "Rates & security" },
    { id: "investors", label: "Investors", hint: "Active accounts" },
    { id: "income", label: "Income", hint: "Daily journal" },
    { id: "tools", label: "Tools", hint: "Enroll, wallet & signals" },
  ];

  if (loading && !settings) {
    return (
      <div className="platform-hub">
        <div className="platform-hero platform-hero-skeleton">
          <div className="skeleton skeleton-line-lg" style={{ width: "40%" }} />
          <div className="skeleton skeleton-line" style={{ width: "60%", marginTop: "0.75rem" }} />
        </div>
        <div className="platform-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="platform-stat-card skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="platform-hub">
      <header className="platform-hero platform-animate-in">
        <div className="platform-hero-glow platform-hero-glow-investor" />
        <div className="platform-hero-glow platform-hero-glow-depositor" />
        <div className="platform-hero-inner">
          <div>
            <p className="platform-eyebrow">Platform control</p>
            <h2 className="platform-title">Investor & depositor</h2>
            <p className="platform-subtitle">
              Enrollment fees, daily yield rates, wallet income, and system signals
              mirrored to investor MT5 accounts at 1:2 RR.
            </p>
          </div>
          <button
            type="button"
            className="platform-refresh-btn"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="platform-stat-grid">
        <article
          className="platform-stat-card platform-stat-investor platform-animate-in"
          style={{ animationDelay: "40ms" }}
        >
          <span className="platform-stat-label">Active investors</span>
          <strong className="platform-stat-value">{stats.investorCount}</strong>
          <span className="platform-stat-meta">
            Tiered fees ($10–$200) · {settings?.investorDailyYieldPercent ?? "—"}% daily
          </span>
        </article>
        <article
          className="platform-stat-card platform-stat-wallet platform-animate-in"
          style={{ animationDelay: "80ms" }}
        >
          <span className="platform-stat-label">Investor wallets</span>
          <strong className="platform-stat-value">{fmtMoney(stats.totalWallet)}</strong>
          <span className="platform-stat-meta">
            Available · invested {fmtMoney(stats.totalInvestment)}
          </span>
        </article>
        <article
          className="platform-stat-card platform-stat-depositor platform-animate-in"
          style={{ animationDelay: "120ms" }}
        >
          <span className="platform-stat-label">Depositor yield</span>
          <strong className="platform-stat-value">
            {settings?.depositorDailyYieldPercent ?? "—"}%
          </strong>
          <span className="platform-stat-meta">
            Min deposit {fmtMoney(settings?.depositorMinDepositUsdt ?? 0)}
          </span>
        </article>
        <article
          className="platform-stat-card platform-stat-income platform-animate-in"
          style={{ animationDelay: "160ms" }}
        >
          <span className="platform-stat-label">Income credited</span>
          <strong className="platform-stat-value">
            {fmtMoney(stats.investorIncome + stats.depositorIncome)}
          </strong>
          <span className="platform-stat-meta">
            {stats.journalCount} journal entries (last 50)
          </span>
        </article>
      </div>

      <nav className="platform-section-nav platform-animate-in" style={{ animationDelay: "200ms" }}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`platform-section-tab${section === s.id ? " active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <span className="platform-section-tab-label">{s.label}</span>
            <span className="platform-section-tab-hint">{s.hint}</span>
          </button>
        ))}
      </nav>

      {section === "overview" && (
        <div className="platform-section platform-animate-in" style={{ animationDelay: "240ms" }}>
          <div className="platform-config-grid">
            <section className="platform-card platform-card-investor">
              <div className="platform-card-head">
                <span className="platform-card-icon platform-card-icon-investor">IN</span>
                <div>
                  <h3>Investor program</h3>
                  <p>
                    Subscription fee by investment size, plus daily wallet earning
                    rate.
                  </p>
                </div>
              </div>
              <div className="platform-field-grid">
                <div className="platform-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Subscription fee tiers</span>
                  <table style={{ width: "100%", fontSize: 13, marginTop: 6 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Investment</th>
                        <th style={{ textAlign: "right" }}>Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(settings?.investorFeeTiers ?? [
                        { label: "$100 – $200", fee: 10 },
                        { label: "$201 – $500", fee: 50 },
                        { label: "$501 – under $1,000", fee: 100 },
                        { label: "$1,000 – $5,000", fee: 200 },
                      ]).map((tier) => (
                        <tr key={tier.label}>
                          <td>{tier.label}</td>
                          <td style={{ textAlign: "right" }}>
                            {fmtMoney(tier.fee)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Fee is charged at enrollment based on the investment amount the
                    trader selects ({settings?.investmentMin ?? 100}–
                    {settings?.investmentMax ?? 5000} USDT).
                  </p>
                </div>
                <label className="platform-field">
                  <span>Daily yield (%)</span>
                  <input
                    className="platform-input"
                    value={investorYield}
                    onChange={(e) => setInvestorYield(e.target.value)}
                  />
                </label>
              </div>
              <label className="platform-toggle" style={{ marginTop: "1rem" }}>
                <input
                  type="checkbox"
                  checked={investorYieldPaused}
                  onChange={(e) => setInvestorYieldPaused(e.target.checked)}
                />
                <span className="platform-toggle-track" />
                <span className="platform-toggle-text">
                  Pause all investor daily revenue (global)
                </span>
              </label>
              <p className="muted" style={{ marginTop: "0.5rem", fontSize: 12 }}>
                Credits run daily at 16:00 Africa/Kampala on each investor&apos;s
                investment balance. Earnings land in their wallet.
              </p>
            </section>

            <section className="platform-card platform-card-depositor">
              <div className="platform-card-head">
                <span className="platform-card-icon platform-card-icon-depositor">DP</span>
                <div>
                  <h3>Depositor program</h3>
                  <p>Fixed-term deposits with daily income over 5 days.</p>
                </div>
              </div>
              <div className="platform-field-grid">
                <label className="platform-field">
                  <span>Daily yield (%)</span>
                  <input
                    className="platform-input"
                    value={depositorYield}
                    onChange={(e) => setDepositorYield(e.target.value)}
                  />
                </label>
                <label className="platform-field">
                  <span>Minimum deposit (USDT)</span>
                  <input
                    className="platform-input"
                    value={minDeposit}
                    onChange={(e) => setMinDeposit(e.target.value)}
                  />
                </label>
              </div>
            </section>
          </div>

          <section className="platform-card platform-card-security">
            <div className="platform-card-head">
              <span className="platform-card-icon platform-card-icon-security">🔒</span>
              <div>
                <h3>Login security</h3>
                <p>Admins always sign in directly; this applies to user accounts.</p>
              </div>
            </div>
            <label className="platform-toggle">
              <input
                type="checkbox"
                checked={loginOtpEnabled}
                onChange={(e) => setLoginOtpEnabled(e.target.checked)}
              />
              <span className="platform-toggle-track" />
              <span className="platform-toggle-text">
                Require 6-digit email OTP on sign-in
              </span>
            </label>
          </section>

          <div className="platform-actions">
            <button
              type="button"
              className="platform-btn platform-btn-primary"
              disabled={settingsSaving}
              onClick={() => void saveSettings()}
            >
              {settingsSaving ? "Saving…" : "Save platform settings"}
            </button>
            <button
              type="button"
              className="platform-btn"
              disabled={broadcastSaving}
              onClick={() => {
                if (
                  !window.confirm(
                    "Email all users about the 24-hour yield hold rule? Use Force only if you already sent once.",
                  )
                ) {
                  return;
                }
                const force = window.confirm(
                  "Force re-send even if already announced? Click Cancel for one-time send only.",
                );
                setBroadcastSaving(true);
                void api
                  .broadcastYieldHoldPolicy(force)
                  .then((res) => {
                    if (res.skipped) {
                      onMessage(
                        `Already announced at ${res.announcedAt ?? "—"}. Use force to re-send.`,
                      );
                      return;
                    }
                    onMessage(
                      `Yield-hold emails: sent ${res.sent}/${res.total} (failed ${res.failed}).`,
                    );
                  })
                  .catch((e) =>
                    onMessage(
                      e instanceof Error ? e.message : "Broadcast failed",
                    ),
                  )
                  .finally(() => setBroadcastSaving(false));
              }}
            >
              {broadcastSaving
                ? "Emailing users…"
                : "Email all: 24h yield rule"}
            </button>
          </div>
        </div>
      )}

      {section === "investors" && (
        <div className="platform-section platform-animate-in">
          <section className="platform-card">
            <div className="platform-card-head">
              <span className="platform-card-icon platform-card-icon-investor">👥</span>
              <div>
                <h3>Active investors</h3>
                <p>
                  Move wallet ↔ investment, override yield, or pause revenue per
                  user. Blank yield uses platform default (
                  {settings?.investorDailyYieldPercent ?? "—"}%). Global pause:{" "}
                  {settings?.investorYieldPaused ? "ON" : "off"}.
                </p>
              </div>
            </div>

            {investors.length === 0 ? (
              <div className="platform-empty">
                <p>No active investors yet.</p>
                <span>Investors appear here after enrollment is confirmed.</span>
              </div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Wallet</th>
                      <th>Investment</th>
                      <th>Yield</th>
                      <th>Transfer</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {investors.map((inv, idx) => (
                      <tr
                        key={inv.id}
                        className="platform-table-row"
                        style={{ animationDelay: `${idx * 35}ms` }}
                      >
                        <td>
                          <div className="platform-user-cell">
                            <strong>{inv.displayName}</strong>
                            <span>{inv.email ?? inv.id.slice(0, 8)}</span>
                            {inv.paused && (
                              <span className="platform-pill platform-pill-warn">
                                MT5 paused
                              </span>
                            )}
                            {inv.yieldPaused && (
                              <span className="platform-pill platform-pill-warn">
                                Yield paused
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="platform-money">
                          {fmtMoney(inv.walletBalance)}
                        </td>
                        <td className="platform-money">
                          {fmtMoney(inv.investmentBalance ?? 0)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span className="platform-pill platform-pill-investor">
                              {inv.effectiveDailyYieldPercent}%
                            </span>
                            <input
                              className="platform-input platform-input-compact"
                              placeholder="Default"
                              style={{ width: 72 }}
                              value={yieldDrafts[inv.id] ?? ""}
                              onChange={(e) =>
                                setYieldDrafts((prev) => ({
                                  ...prev,
                                  [inv.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="platform-btn platform-btn-ghost"
                              onClick={() => {
                                const raw = yieldDrafts[inv.id]?.trim();
                                const dailyYieldPercent =
                                  raw === "" ? null : Number(raw);
                                void api
                                  .updateInvestorYield(inv.id, dailyYieldPercent)
                                  .then((res) => {
                                    setInvestors((prev) =>
                                      prev.map((row) =>
                                        row.id === inv.id
                                          ? {
                                              ...row,
                                              dailyYieldPercent: res.dailyYieldPercent,
                                              effectiveDailyYieldPercent:
                                                res.effectiveDailyYieldPercent,
                                            }
                                          : row,
                                      ),
                                    );
                                    onMessage(
                                      `Investor yield updated for ${inv.displayName}.`,
                                    );
                                  })
                                  .catch((e) =>
                                    onMessage(
                                      e instanceof Error ? e.message : "Update failed",
                                    ),
                                  );
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              className="platform-input platform-input-compact"
                              placeholder="Amount"
                              style={{ width: 80 }}
                              value={transferDrafts[inv.id] ?? ""}
                              onChange={(e) =>
                                setTransferDrafts((prev) => ({
                                  ...prev,
                                  [inv.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="platform-btn platform-btn-ghost"
                              title="Wallet → Investment"
                              onClick={() => {
                                const amount = Number(transferDrafts[inv.id]);
                                void api
                                  .transferInvestorFunds(inv.id, {
                                    amount,
                                    direction: "to_investment",
                                  })
                                  .then((res) => {
                                    setInvestors((prev) =>
                                      prev.map((row) =>
                                        row.id === inv.id
                                          ? {
                                              ...row,
                                              walletBalance: res.walletBalance,
                                              investmentBalance: res.investmentBalance,
                                            }
                                          : row,
                                      ),
                                    );
                                    setTransferDrafts((prev) => ({
                                      ...prev,
                                      [inv.id]: "",
                                    }));
                                    onMessage(
                                      `Moved ${fmtMoney(res.amount)} to investment for ${inv.displayName}.`,
                                    );
                                  })
                                  .catch((e) =>
                                    onMessage(
                                      e instanceof Error ? e.message : "Transfer failed",
                                    ),
                                  );
                              }}
                            >
                              → Inv
                            </button>
                            <button
                              type="button"
                              className="platform-btn platform-btn-ghost"
                              title="Investment → Wallet"
                              onClick={() => {
                                const amount = Number(transferDrafts[inv.id]);
                                void api
                                  .transferInvestorFunds(inv.id, {
                                    amount,
                                    direction: "to_wallet",
                                  })
                                  .then((res) => {
                                    setInvestors((prev) =>
                                      prev.map((row) =>
                                        row.id === inv.id
                                          ? {
                                              ...row,
                                              walletBalance: res.walletBalance,
                                              investmentBalance: res.investmentBalance,
                                            }
                                          : row,
                                      ),
                                    );
                                    setTransferDrafts((prev) => ({
                                      ...prev,
                                      [inv.id]: "",
                                    }));
                                    onMessage(
                                      `Moved ${fmtMoney(res.amount)} to wallet for ${inv.displayName}.`,
                                    );
                                  })
                                  .catch((e) =>
                                    onMessage(
                                      e instanceof Error ? e.message : "Transfer failed",
                                    ),
                                  );
                              }}
                            >
                              → Wallet
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="platform-btn platform-btn-ghost"
                            onClick={() => {
                              const next = !inv.yieldPaused;
                              void api
                                .setInvestorYieldPaused(inv.id, next)
                                .then((res) => {
                                  setInvestors((prev) =>
                                    prev.map((row) =>
                                      row.id === inv.id
                                        ? { ...row, yieldPaused: res.yieldPaused }
                                        : row,
                                    ),
                                  );
                                  onMessage(
                                    next
                                      ? `Yield paused for ${inv.displayName}.`
                                      : `Yield resumed for ${inv.displayName}.`,
                                  );
                                })
                                .catch((e) =>
                                  onMessage(
                                    e instanceof Error ? e.message : "Update failed",
                                  ),
                                );
                            }}
                          >
                            {inv.yieldPaused ? "Resume yield" : "Pause yield"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {section === "income" && (
        <div className="platform-section platform-animate-in">
          <section className="platform-card">
            <div className="platform-card-toolbar">
              <div className="platform-card-head">
                <span className="platform-card-icon platform-card-icon-income">📈</span>
                <div>
                  <h3>Daily income journal</h3>
                  <p>Investor and depositor earnings credited to platform wallets.</p>
                </div>
              </div>
              <div className="platform-toolbar-actions">
                <select
                  className="platform-input platform-input-select"
                  value={journalSource}
                  onChange={(e) =>
                    setJournalSource(e.target.value as "" | "INVESTOR" | "DEPOSITOR")
                  }
                >
                  <option value="">All sources</option>
                  <option value="INVESTOR">Investor</option>
                  <option value="DEPOSITOR">Depositor</option>
                </select>
                <button
                  type="button"
                  className="platform-btn platform-btn-ghost"
                  onClick={() => void refreshJournal()}
                >
                  Apply filter
                </button>
              </div>
            </div>

            {incomeJournal.length === 0 ? (
              <div className="platform-empty">
                <p>No daily income entries yet.</p>
                <span>Credits appear after the daily earning job runs.</span>
              </div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>User</th>
                      <th>Source</th>
                      <th>Amount</th>
                      <th>Yield</th>
                      <th>Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeJournal.map((entry, idx) => (
                      <tr
                        key={`${entry.source}-${entry.id}`}
                        className="platform-table-row"
                        style={{ animationDelay: `${idx * 25}ms` }}
                      >
                        <td>{entry.creditDate}</td>
                        <td>
                          <div className="platform-user-cell">
                            <strong>{entry.displayName}</strong>
                            <span>{entry.userEmail ?? entry.userId.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`platform-pill ${
                              entry.source === "INVESTOR"
                                ? "platform-pill-investor"
                                : "platform-pill-depositor"
                            }`}
                          >
                            {entry.source}
                            {entry.dayIndex != null ? ` · day ${entry.dayIndex}` : ""}
                          </span>
                        </td>
                        <td className="platform-money platform-money-positive">
                          +{fmtMoney(entry.amount)}
                        </td>
                        <td>{entry.yieldPercent}%</td>
                        <td className="platform-money">{fmtMoney(entry.baseBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {section === "tools" && (
        <div className="platform-section platform-tools-grid platform-animate-in">
          <section className="platform-card platform-card-investor">
            <div className="platform-card-head">
              <span className="platform-card-icon platform-card-icon-investor">IN</span>
              <div>
                <h3>Enroll investor</h3>
                <p>
                  Activate a user in the investor program by email. Complimentary
                  grants the full amount as investment ($0 fee). Wallet charges the
                  normal tiered fee from their balance.
                </p>
              </div>
            </div>
            <div className="platform-field-stack">
              <label className="platform-field">
                <span>User email</span>
                <input
                  className="platform-input"
                  placeholder="trader@example.com"
                  value={enrollEmail}
                  onChange={(e) => setEnrollEmail(e.target.value)}
                />
              </label>
              <label className="platform-field">
                <span>Investment amount (USDT)</span>
                <input
                  className="platform-input"
                  type="number"
                  min="100"
                  max="5000"
                  step="1"
                  value={enrollAmount}
                  onChange={(e) => setEnrollAmount(e.target.value)}
                />
              </label>
              <label className="platform-field">
                <span>Payment source</span>
                <select
                  className="platform-input platform-input-select"
                  value={enrollSource}
                  onChange={(e) =>
                    setEnrollSource(e.target.value as "wallet" | "comp")
                  }
                >
                  <option value="comp">Complimentary (fee waived)</option>
                  <option value="wallet">Charge user wallet</option>
                </select>
              </label>
              <label className="platform-field">
                <span>Note (optional)</span>
                <input
                  className="platform-input"
                  placeholder="Promo, support grant, etc."
                  value={enrollNote}
                  onChange={(e) => setEnrollNote(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="platform-btn platform-btn-primary"
              disabled={
                enrollSaving || !enrollEmail.trim() || !enrollAmount
              }
              onClick={() => {
                setEnrollSaving(true);
                void api
                  .enrollInvestor({
                    email: enrollEmail.trim(),
                    investmentAmount: Number(enrollAmount),
                    source: enrollSource,
                    note: enrollNote.trim() || undefined,
                  })
                  .then((res) => {
                    onMessage(
                      `${res.message || `Enrolled ${res.displayName} — invested ${fmtMoney(res.netInvested)} (fee ${fmtMoney(res.feeUsdt)}).`} Confirmation email sent.`,
                    );
                    setEnrollEmail("");
                    setEnrollAmount("100");
                    setEnrollNote("");
                    setEnrollSource("comp");
                    void load();
                  })
                  .catch((e) =>
                    onMessage(e instanceof Error ? e.message : "Enroll failed"),
                  )
                  .finally(() => setEnrollSaving(false));
              }}
            >
              {enrollSaving ? "Enrolling…" : "Enroll investor"}
            </button>
          </section>

          <section className="platform-card platform-card-tool">
            <div className="platform-card-head">
              <span className="platform-card-icon platform-card-icon-wallet">💳</span>
              <div>
                <h3>Credit user wallet</h3>
                <p>Add USDT to any user&apos;s platform wallet by email.</p>
              </div>
            </div>
            <div className="platform-field-stack">
              <label className="platform-field">
                <span>User email</span>
                <input
                  className="platform-input"
                  placeholder="trader@example.com"
                  value={creditEmail}
                  onChange={(e) => setCreditEmail(e.target.value)}
                />
              </label>
              <label className="platform-field">
                <span>Amount (USDT)</span>
                <input
                  className="platform-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                />
              </label>
              <label className="platform-field">
                <span>Note (optional)</span>
                <input
                  className="platform-input"
                  placeholder="Bonus, correction, etc."
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="platform-btn platform-btn-primary"
              disabled={creditSaving || !creditEmail.trim() || !creditAmount}
              onClick={() => {
                setCreditSaving(true);
                void api
                  .creditUserWallet({
                    email: creditEmail.trim(),
                    amount: Number(creditAmount),
                    description: creditNote.trim() || undefined,
                  })
                  .then((res) => {
                    onMessage(
                      `Credited ${fmtMoney(res.amount)} to ${res.displayName} — balance ${fmtMoney(res.balance)}.` +
                        (res.emailSent
                          ? " Email sent."
                          : " Email NOT sent (check Resend)."),
                    );
                    setCreditEmail("");
                    setCreditAmount("");
                    setCreditNote("");
                    void load();
                  })
                  .catch((e) =>
                    onMessage(e instanceof Error ? e.message : "Credit failed"),
                  )
                  .finally(() => setCreditSaving(false));
              }}
            >
              {creditSaving ? "Crediting…" : "Credit wallet"}
            </button>
          </section>

          <section className="platform-card platform-card-signal">
            <div className="platform-card-head">
              <span className="platform-card-icon platform-card-icon-signal">⚡</span>
              <div>
                <h3>Publish system signal</h3>
                <p>
                  Creates an OPEN system setup with 1:2 RR and mirrors to all active
                  investor MT5 accounts.
                </p>
              </div>
            </div>
            <div className="platform-field-grid">
              <label className="platform-field">
                <span>Symbol</span>
                <input
                  className="platform-input"
                  value={systemSymbol}
                  onChange={(e) => setSystemSymbol(e.target.value)}
                />
              </label>
              <label className="platform-field">
                <span>Direction</span>
                <select
                  className="platform-input platform-input-select"
                  value={systemDirection}
                  onChange={(e) =>
                    setSystemDirection(e.target.value as "BUY" | "SELL")
                  }
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </label>
              <label className="platform-field">
                <span>Entry min</span>
                <input
                  className="platform-input"
                  value={systemEntryMin}
                  onChange={(e) => setSystemEntryMin(e.target.value)}
                />
              </label>
              <label className="platform-field">
                <span>Entry max</span>
                <input
                  className="platform-input"
                  value={systemEntryMax}
                  onChange={(e) => setSystemEntryMax(e.target.value)}
                />
              </label>
              <label className="platform-field platform-field-wide">
                <span>Stop loss</span>
                <input
                  className="platform-input"
                  value={systemSl}
                  onChange={(e) => setSystemSl(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className={`platform-btn platform-btn-signal${systemPublishing ? " publishing" : ""}`}
              disabled={systemPublishing}
              onClick={() => {
                setSystemPublishing(true);
                setSystemPublishResult(null);
                void api
                  .publishSystemSignal({
                    symbol: systemSymbol.trim(),
                    direction: systemDirection,
                    entryMin: Number(systemEntryMin),
                    entryMax: Number(systemEntryMax),
                    stopLoss: Number(systemSl),
                  })
                  .then((res) =>
                    setSystemPublishResult(
                      `Published ${res.signalId} — ${res.symbol} ${res.direction} at ${fmtDate(new Date().toISOString())}`,
                    ),
                  )
                  .catch((e) =>
                    setSystemPublishResult(
                      e instanceof Error ? e.message : "Publish failed",
                    ),
                  )
                  .finally(() => setSystemPublishing(false));
              }}
            >
              {systemPublishing ? "Publishing…" : "Publish & mirror to investors"}
            </button>
            {systemPublishResult && (
              <p
                className={`platform-publish-result${
                  systemPublishResult.startsWith("Published") ? " success" : " error"
                }`}
              >
                {systemPublishResult}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
