import { useCallback, useEffect, useState } from "react";
import { api, type PlatformPaymentRow, type PlatformPaymentsResult } from "./api";

function fmtMoney(n: number | string | null | undefined) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function purposeLabel(purpose: string) {
  return purpose.replace(/_/g, " ");
}

function methodBadge(method: string) {
  if (method === "momo") return "badge confirmed";
  if (method === "wallet") return "badge pending";
  return "badge";
}

const PAGE_SIZE = 50;

const PURPOSES = [
  "",
  "registration",
  "wallet_deposit",
  "investor_enrollment",
  "evaluation_enrollment",
  "mt5_sync",
  "profit_share",
  "setup_plan",
];

type Props = {
  onOpenUser?: (userId: string) => void;
};

export function TransactionsPanel({ onOpenUser }: Props) {
  const [data, setData] = useState<PlatformPaymentsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [purpose, setPurpose] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError("");
      try {
        const res = await api.payments({
          limit: PAGE_SIZE,
          offset: nextPage * PAGE_SIZE,
          status: status || undefined,
          purpose: purpose || undefined,
          method: method || undefined,
          search: search || undefined,
        });
        setData(res);
        setPage(nextPage);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : "Failed to load payments");
      } finally {
        setLoading(false);
      }
    },
    [status, purpose, method, search],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const items: PlatformPaymentRow[] = data?.items ?? [];
  const count = data?.count ?? 0;
  const summary = data?.summary;
  const maxPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);

  return (
    <div>
      <div className="toolbar toolbar-wrap">
        <div>
          <h2 style={{ margin: 0 }}>Transactions</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            Platform payments via crypto (NOWPayments) or MoMo (Flutterwave).
          </p>
        </div>
        <button type="button" onClick={() => void load(page)} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {summary && (
        <div className="cards" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <div className="label">Filtered confirmed</div>
            <div className="value">{fmtMoney(summary.filteredConfirmedUsdt)}</div>
            <div className="muted">{summary.filteredConfirmedCount} payment(s)</div>
          </div>
          <div className="card">
            <div className="label">Filtered pending</div>
            <div className="value">{summary.filteredPendingCount}</div>
          </div>
          <div className="card">
            <div className="label">All MoMo confirmed</div>
            <div className="value">{fmtMoney(summary.momoConfirmedUsdt)}</div>
            <div className="muted">{summary.momoConfirmedCount} payment(s)</div>
          </div>
          <div className="card">
            <div className="label">All crypto confirmed</div>
            <div className="value">{fmtMoney(summary.cryptoConfirmedUsdt)}</div>
            <div className="muted">{summary.cryptoConfirmedCount} payment(s)</div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          <option value="momo">MoMo</option>
          <option value="crypto">Crypto</option>
          <option value="wallet">Wallet</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {PURPOSES.map((p) => (
            <option key={p || "all"} value={p}>
              {p ? purposeLabel(p) : "All purposes"}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchDraft.trim());
          }}
          style={{ display: "flex", gap: "0.5rem", flex: 1, minWidth: 220 }}
        >
          <input
            className="users-search"
            placeholder="Search email, name, tx, address…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-label="Search payments"
          />
          <button type="submit">Search</button>
          {(search || status || purpose || method) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchDraft("");
                setStatus("");
                setPurpose("");
                setMethod("");
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {error && <p className="message error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>User</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Purpose</th>
            <th>Status</th>
            <th>Gateway</th>
            <th>Destination</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>
                <div>{fmtDate(p.createdAt)}</div>
                {p.confirmedAt && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Confirmed {fmtDate(p.confirmedAt)}
                  </div>
                )}
              </td>
              <td>
                {onOpenUser ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpenUser(p.user.id)}
                  >
                    {p.user.displayName}
                  </button>
                ) : (
                  p.user.displayName
                )}
                <div className="muted" style={{ fontSize: 12 }}>
                  {p.user.email ?? "—"}
                </div>
              </td>
              <td>
                <strong>{fmtMoney(p.amount)}</strong>
                {p.amountLocal != null && p.localCurrency && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {p.amountLocal.toLocaleString()} {p.localCurrency}
                  </div>
                )}
              </td>
              <td>
                <span className={methodBadge(p.method)}>
                  {p.method === "momo"
                    ? `MoMo${p.momoNetwork ? ` · ${p.momoNetwork}` : ""}`
                    : p.method === "wallet"
                      ? "Wallet"
                      : p.network}
                </span>
              </td>
              <td className="muted">{purposeLabel(p.purpose)}</td>
              <td>
                <span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span>
              </td>
              <td className="muted">{p.gateway}</td>
              <td className="mono muted" style={{ maxWidth: 180, wordBreak: "break-all" }}>
                {p.method === "momo"
                  ? p.momoPhone
                    ? `+${p.momoPhone}`
                    : "—"
                  : p.payAddress
                    ? `${p.payAddress.slice(0, 12)}…`
                    : p.txHash
                      ? `${p.txHash.slice(0, 12)}…`
                      : "—"}
              </td>
            </tr>
          ))}
          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No payments match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {count > 0 && (
        <div className="pagination-bar">
          <span className="muted pagination-summary">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of{" "}
            {count}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              disabled={page <= 0 || loading}
              onClick={() => void load(page - 1)}
            >
              Previous
            </button>
            <span className="muted">
              Page {page + 1} / {maxPage + 1}
            </span>
            <button
              type="button"
              disabled={page >= maxPage || loading}
              onClick={() => void load(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
