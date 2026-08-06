import { useCallback, useEffect, useState } from "react";
import { api, type EngineSnapshot } from "./api";

function fmtUsdt(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type Props = {
  onMessage?: (msg: string) => void;
};

export function EnginePanel({ onMessage }: Props) {
  const [data, setData] = useState<EngineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await api.engine();
      setData(snap);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load engine";
      setError(msg);
      onMessage?.(msg);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.totalFundsUsdt ?? 0;
  const split = data?.split ?? {
    contractBudgetUsdt: 0,
    tradingFundsUsdt: 0,
    reserveFundsUsdt: 0,
  };
  const profit = data?.profit ?? {
    dailyRevenueUsdt: 0,
    paidToUsersTodayUsdt: 0,
    profitFundsUsdt: 0,
  };
  const profitRatio =
    profit.dailyRevenueUsdt > 0
      ? Math.min(1, profit.profitFundsUsdt / profit.dailyRevenueUsdt)
      : 0;

  return (
    <div className="engine-page">
      <div className="toolbar toolbar-wrap">
        <div>
          <h2>Allocation engine</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            Illustration of how total platform funds split across contract,
            trading, and reserve — plus daily profit after payouts.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="muted" style={{ color: "#f87171", marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      <section className="engine-hero">
        <div className="engine-hero-glow engine-hero-glow-a" />
        <div className="engine-hero-glow engine-hero-glow-b" />
        <div className="engine-hero-inner">
          <div>
            <p className="engine-eyebrow">Automatic allocation engine</p>
            <p className="engine-total-label">Total funds</p>
            <p className="engine-total-value">{fmtUsdt(total)}</p>
            <p className="engine-asof">
              {data?.asOf
                ? `As of ${new Date(data.asOf).toLocaleString()} · UTC day for paid`
                : loading
                  ? "Loading…"
                  : "—"}
            </p>
          </div>
          <div className="engine-hero-meta">
            <span>Available {fmtUsdt(data?.breakdown?.availableBalanceUsdt ?? 0)}</span>
            <span>Investor {fmtUsdt(data?.breakdown?.investorBalanceUsdt ?? 0)}</span>
            <span>Unitrust {fmtUsdt(data?.breakdown?.unitrustBalanceUsdt ?? 0)}</span>
            <span>Locked {fmtUsdt(data?.breakdown?.lockedBalanceUsdt ?? 0)}</span>
          </div>
        </div>
      </section>

      <section className="engine-flow">
        <h3 className="engine-section-title">Capital split · 100%</h3>
        <div className="engine-flow-grid">
          <div className="engine-source">
            <div className="engine-source-core">
              <span className="engine-chip">Source</span>
              <strong>Total funds</strong>
              <span className="engine-source-amt">{fmtUsdt(total)}</span>
            </div>
            <svg
              className="engine-pipes"
              viewBox="0 0 120 220"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path className="engine-pipe" d="M20 110 H70" />
              <path className="engine-pipe engine-pipe-flow" d="M70 40 H110" />
              <path className="engine-pipe engine-pipe-flow" d="M70 110 H110" />
              <path className="engine-pipe engine-pipe-flow" d="M70 180 H110" />
              <path className="engine-pipe" d="M70 40 V180" />
            </svg>
          </div>

          <div className="engine-tanks">
            {(
              [
                {
                  key: "contract",
                  label: "Contract Budget",
                  pct: 40,
                  amount: split.contractBudgetUsdt,
                  tone: "contract",
                },
                {
                  key: "trading",
                  label: "Trading Funds",
                  pct: 40,
                  amount: split.tradingFundsUsdt,
                  tone: "trading",
                },
                {
                  key: "reserve",
                  label: "Reserve Funds",
                  pct: 20,
                  amount: split.reserveFundsUsdt,
                  tone: "reserve",
                },
              ] as const
            ).map((tank) => (
              <div key={tank.key} className={`engine-tank engine-tank-${tank.tone}`}>
                <div className="engine-tank-head">
                  <span className="engine-chip">{tank.pct}%</span>
                  <strong>{tank.label}</strong>
                </div>
                <div className="engine-tank-body">
                  <div
                    className="engine-tank-fill"
                    style={{
                      height: `${Math.max(8, tank.pct)}%`,
                    }}
                  />
                  <div className="engine-tank-label">{fmtUsdt(tank.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="engine-profit">
        <h3 className="engine-section-title">Profit funds · daily</h3>
        <p className="engine-formula">
          <span>10% of total</span>
          <span className="engine-op">−</span>
          <span>Paid to users today</span>
          <span className="engine-op">=</span>
          <span className="engine-formula-result">Profit funds</span>
        </p>
        <div className="engine-profit-grid">
          <div className="engine-profit-card">
            <span className="muted">Daily revenue (10%)</span>
            <strong>{fmtUsdt(profit.dailyRevenueUsdt)}</strong>
          </div>
          <div className="engine-profit-card">
            <span className="muted">Paid today (trader share)</span>
            <strong>{fmtUsdt(profit.paidToUsersTodayUsdt)}</strong>
          </div>
          <div className="engine-profit-card engine-profit-result">
            <span className="muted">Profit funds</span>
            <strong>{fmtUsdt(profit.profitFundsUsdt)}</strong>
          </div>
        </div>
        <div className="engine-gauge" aria-hidden>
          <div className="engine-gauge-track">
            <div
              className="engine-gauge-fill"
              style={{ width: `${Math.round(profitRatio * 100)}%` }}
            />
          </div>
          <div className="engine-gauge-caption">
            Remaining after payouts · {Math.round(profitRatio * 100)}% of daily
            revenue
          </div>
        </div>
      </section>
    </div>
  );
}
