import { useCallback, useEffect, useState } from "react";
import {
  api,
  getToken,
  setToken,
  type KycRow,
  type PayoutRow,
  type SignalRow,
  type UserRow,
} from "./api";

type Tab = "overview" | "users" | "signals" | "kyc" | "payouts" | "tpClaims";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "1. Overview" },
  { id: "users", label: "2. Users" },
  { id: "signals", label: "3. Setups" },
  { id: "kyc", label: "4. KYC" },
  { id: "payouts", label: "5. Payouts" },
  { id: "tpClaims", label: "6. TP Claims" },
];

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

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [signalCount, setSignalCount] = useState(0);
  const [kycQueue, setKycQueue] = useState<KycRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [tpClaims, setTpClaims] = useState<TpClaimRow[]>([]);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [tpRejectReason, setTpRejectReason] = useState<Record<string, string>>({});

  const loadTab = useCallback(async (active: Tab) => {
    setLoading(true);
    setMessage("");
    try {
      if (active === "overview") {
        setOverview(await api.overview());
      } else if (active === "users") {
        const res = await api.users();
        setUsers(res.items);
        setUserCount(res.count);
      } else if (active === "signals") {
        const res = await api.signals();
        setSignals(res.items);
        setSignalCount(res.count);
      } else if (active === "kyc") {
        setKycQueue(await api.kycPending());
      } else if (active === "payouts") {
        const res = await api.payouts();
        setPayouts(res.items);
      } else if (active === "tpClaims") {
        setTpClaims(await api.tpClaimsPending());
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) void loadTab(tab);
  }, [authed, tab, loadTab]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await api.login(email, password);
      if (res.user.role !== "ADMIN") {
        setLoginError("This account is not an admin.");
        return;
      }
      setToken(res.accessToken);
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  }

  function logout() {
    setToken(null);
    setAuthed(false);
  }

  async function refresh() {
    await loadTab(tab);
    setMessage("Refreshed");
  }

  if (!authed) {
    return (
      <div className="login">
        <h1>TraderRank Local Admin</h1>
        <p className="muted">Runs on your machine only — not on thetradeguard.com</p>
        <form onSubmit={(e) => void handleLogin(e)}>
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
          {loginError && <p className="message error">{loginError}</p>}
          <button type="submit">Sign in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Local Admin</h1>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: "1.5rem", padding: "0 0.5rem" }}>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" onClick={logout} style={{ marginTop: "0.5rem" }}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        {message && (
          <div className={`message ${message.includes("fail") ? "error" : ""}`}>
            {message}
          </div>
        )}
        {loading && <p className="muted">Loading…</p>}

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
                <div className="label">Today signups</div>
                <div className="value">{String(overview.todayRegistrations ?? "—")}</div>
              </div>
            </div>
            <p className="muted">
              Use the sidebar tabs to review users, setups, KYC, and payouts step by step.
            </p>
          </>
        )}

        {tab === "users" && (
          <>
            <div className="toolbar">
              <h2>Users ({userCount})</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>KYC</th>
                  <th>Paid</th>
                  <th>Setups</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.displayName}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={badgeClass(u.status)}>{u.status}</span>
                    </td>
                    <td>{u.kyc?.status ?? "—"}</td>
                    <td>{u.registrationPaid ? "Yes" : "No"}</td>
                    <td>{u._count.signals}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === "signals" && (
          <>
            <div className="toolbar">
              <h2>Setups shared ({signalCount})</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th>Entry</th>
                  <th>SL / TP</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.signalId}>
                    <td>{s.user.displayName}</td>
                    <td>{s.symbol}</td>
                    <td>{s.direction}</td>
                    <td>
                      {s.entryMin} – {s.entryMax}
                    </td>
                    <td>
                      {s.stopLoss} / {s.takeProfit}
                    </td>
                    <td>
                      <span className={badgeClass(s.status)}>{s.status}</span>
                    </td>
                    <td>{fmtDate(s.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                kycQueue.map((item) => (
                  <div key={item.id} className="kyc-card">
                    <p>
                      <strong>{item.user.displayName}</strong> — {item.user.email}
                    </p>
                    <p className="muted">{item.documentType}</p>
                    <div style={{ margin: "0.5rem 0" }}>
                      {item.documentFrontUrl && (
                        <img src={item.documentFrontUrl} alt="ID" />
                      )}
                      {item.selfieUrl && <img src={item.selfieUrl} alt="Selfie" />}
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
                        onClick={() =>
                          void api.approveKyc(item.userId).then(() => loadTab("kyc"))
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          void api
                            .rejectKyc(
                              item.userId,
                              rejectReason[item.userId] || "Documents unclear",
                            )
                            .then(() => loadTab("kyc"))
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

        {tab === "payouts" && (
          <>
            <div className="toolbar">
              <h2>Payout requests</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Amount</th>
                  <th>Wallet</th>
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
                    <td>{fmtMoney(p.traderShare)}</td>
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
                            disabled={
                              p.user.kyc?.status !== "APPROVED" || !p.walletAddress
                            }
                            onClick={() =>
                              void api
                                .approvePayout(p.id)
                                .then(() => loadTab("payouts"))
                            }
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      {item.symbol} {item.direction} · Entry {item.entryMin} –{" "}
                      {item.entryMax} · TP {item.takeProfit}
                    </p>
                    <p className="muted">Submitted {fmtDate(item.submittedAt)}</p>
                    <div style={{ margin: "0.5rem 0", display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
                      <div>
                        <p className="muted" style={{ fontSize: "0.75rem" }}>Before</p>
                        <img src={item.beforeScreenshotUrl} alt="Before" />
                      </div>
                      <div>
                        <p className="muted" style={{ fontSize: "0.75rem" }}>After (TP)</p>
                        <img src={item.afterScreenshotUrl} alt="After" />
                      </div>
                      {item.originalScreenshotUrl && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <p className="muted" style={{ fontSize: "0.75rem" }}>Original submission</p>
                          <img src={item.originalScreenshotUrl} alt="Original setup" />
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
                        Approve & credit TP
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
      </main>
    </div>
  );
}
