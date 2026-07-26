import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ProductAgentOverview,
  type ProductAgentPlanRow,
  type ProductAgentProfileRow,
  type ReturnProductRow,
} from "./api";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

type View = "plans" | "profiles" | "products";

export function ProductAgentPanel() {
  const [overview, setOverview] = useState<ProductAgentOverview | null>(null);
  const [plans, setPlans] = useState<ProductAgentPlanRow[]>([]);
  const [planCount, setPlanCount] = useState(0);
  const [planStatus, setPlanStatus] = useState("PLANNED");
  const [profiles, setProfiles] = useState<ProductAgentProfileRow[]>([]);
  const [profileCount, setProfileCount] = useState(0);
  const [products, setProducts] = useState<ReturnProductRow[]>([]);
  const [view, setView] = useState<View>("plans");
  const [selectedProfile, setSelectedProfile] =
    useState<ProductAgentProfileRow | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    slug: "",
    name: "",
    description: "",
    cadence: "daily",
    yieldLabel: "",
  });

  const load = useCallback(async () => {
    const [ov, planRes, profRes, prodRes] = await Promise.all([
      api.productAgentOverview(),
      api.productAgentPlans(planStatus, 150),
      api.productAgentProfiles(50),
      api.productAgentProducts(),
    ]);
    setOverview(ov);
    setPlans(planRes.items);
    setPlanCount(planRes.count);
    setProfiles(profRes.items);
    setProfileCount(profRes.count);
    setProducts(prodRes.items);
  }, [planStatus]);

  useEffect(() => {
    void load().catch((err) =>
      setMessage(err instanceof Error ? err.message : "Failed to load"),
    );
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    setMessage("");
    try {
      const res = await fn();
      setMessage(
        typeof res === "object" && res && "message" in res
          ? String((res as { message?: string }).message || okMsg)
          : okMsg,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="toolbar toolbar-wrap">
        <div>
          <h2>Product agent</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0", maxWidth: 640 }}>
            {overview?.cadence ??
              "Builds usage profiles, then randomly plans 1/3/5 emails per week for return products each user is not using."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() =>
              void run(
                "rebuild",
                () => api.productAgentRebuildProfiles(),
                "Profiles rebuilt",
              )
            }
          >
            {busy === "rebuild" ? "Rebuilding…" : "Rebuild profiles"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() =>
              void run(
                "sync",
                () => api.productAgentSyncEnrollments(),
                "Enrollments synced",
              )
            }
          >
            {busy === "sync" ? "Syncing…" : "Sync enrollments"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy !== null}
            onClick={() =>
              void (async () => {
                setBusy("plan");
                setMessage("");
                try {
                  const res = await api.productAgentPlanWeek(true);
                  setMessage(
                    `Planned ${res.created} emails for week starting ${new Date(res.weekStart).toLocaleDateString()}`,
                  );
                  await load();
                } catch (err) {
                  setMessage(
                    err instanceof Error ? err.message : "Plan failed",
                  );
                } finally {
                  setBusy(null);
                }
              })()
            }
          >
            {busy === "plan" ? "Planning…" : "Plan week (force)"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() =>
              void run(
                "send",
                () => api.productAgentSendDue(),
                "Due emails processed",
              )
            }
          >
            {busy === "send" ? "Sending…" : "Send due now"}
          </button>
        </div>
      </div>

      {message && (
        <p className="muted" style={{ marginBottom: "1rem" }}>
          {message}
        </p>
      )}

      {overview && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          }}
        >
          {[
            ["Products", overview.stats.activeProducts],
            ["Profiles", overview.stats.profiles],
            ["Planned (week)", overview.stats.plannedThisWeek],
            ["Sent (week)", overview.stats.sentThisWeek],
            ["Due <24h", overview.stats.dueWithin24h],
            ["Page events 7d", overview.stats.pageEventsLast7d],
          ].map(([label, value]) => (
            <div key={String(label)} className="kyc-card" style={{ padding: "0.85rem" }}>
              <div className="muted" style={{ fontSize: 12 }}>
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 650 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {!overview?.emailConfigured && (
        <div
          className="kyc-card"
          style={{
            marginBottom: "1rem",
            borderColor: "#f59e0b",
            background: "rgba(245, 158, 11, 0.08)",
          }}
        >
          <strong style={{ color: "#fbbf24" }}>Email not configured</strong>
          <p className="muted" style={{ margin: "0.4rem 0 0" }}>
            Plans still appear below. Sending needs RESEND_API_KEY on the API.
            From: {overview?.emailFrom ?? "—"}
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(
          [
            ["plans", `Planned emails (${planCount})`],
            ["profiles", `User profiles (${profileCount})`],
            ["products", `Products (${products.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "primary" : "btn-secondary"}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "plans" && (
        <>
          <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem" }}>
            {["PLANNED", "SENT", "SKIPPED", "FAILED", "CANCELLED", "all"].map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  className={planStatus === s ? "primary" : "btn-secondary"}
                  style={{ fontSize: 12, padding: "0.35rem 0.65rem" }}
                  onClick={() => setPlanStatus(s)}
                >
                  {s}
                </button>
              ),
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Planned at</th>
                <th>User</th>
                <th>Product</th>
                <th>/week</th>
                <th>Angle</th>
                <th>Subject</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No plans yet — click “Plan week (force)” after rebuilding
                    profiles.
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {fmtDate(p.plannedAt)}
                    </td>
                    <td>
                      <div>{p.user.displayName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.user.email}
                      </div>
                    </td>
                    <td>
                      {p.product.name}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.product.slug} · {p.product.cadence}
                      </div>
                    </td>
                    <td>{p.sendsPerWeek}×</td>
                    <td>
                      <code style={{ fontSize: 11 }}>{p.copyAngle}</code>
                    </td>
                    <td>
                      <div>{p.subject}</div>
                      <div className="muted" style={{ fontSize: 12, maxWidth: 320 }}>
                        {p.previewText.slice(0, 120)}
                        {p.previewText.length > 120 ? "…" : ""}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${p.status.toLowerCase()}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}

      {view === "profiles" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedProfile
              ? "minmax(280px, 1fr) minmax(320px, 1.2fr)"
              : "1fr",
            gap: "1rem",
          }}
        >
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Investing</th>
                <th>Unused products</th>
                <th>Active hours (UTC)</th>
                <th>Rebuilt</th>
              </tr>
            </thead>
            <tbody>
              {profiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No profiles yet — click “Rebuild profiles”.
                  </td>
                </tr>
              ) : (
                profiles.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      cursor: "pointer",
                      background:
                        selectedProfile?.id === row.id
                          ? "rgba(56, 189, 248, 0.08)"
                          : undefined,
                    }}
                    onClick={() => setSelectedProfile(row)}
                  >
                    <td>
                      <div>{row.user.displayName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.user.email}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.profile.investing.investorActive && "Investor "}
                      {row.profile.investing.depositorActive && "Depositor "}
                      {row.profile.investing.autoReinvest && "Auto-reinvest "}
                      {!row.profile.investing.investorActive &&
                        !row.profile.investing.depositorActive && (
                          <span className="muted">None</span>
                        )}
                      <div className="muted">
                        bal ${row.profile.investing.investorBalance.toFixed(0)}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.profile.unusedProductSlugs.length
                        ? row.profile.unusedProductSlugs.join(", ")
                        : "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.profile.presence.activeHoursUtc.length
                        ? row.profile.presence.activeHoursUtc
                            .map((h) => `${h}:00`)
                            .join(", ")
                        : "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                      {fmtDate(row.rebuiltAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {selectedProfile && (
            <div className="kyc-card" style={{ padding: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.75rem",
                }}
              >
                <strong>
                  Profile — {selectedProfile.user.displayName}
                </strong>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => setSelectedProfile(null)}
                >
                  Close
                </button>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                {selectedProfile.profile.styleHints.join(" · ") ||
                  "No style hints yet"}
              </p>
              <div style={{ marginBottom: "0.75rem" }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Top paths
                </div>
                <ul style={{ margin: "0.35rem 0", paddingLeft: "1.1rem" }}>
                  {selectedProfile.profile.presence.topPaths.map((p) => (
                    <li key={p.path} style={{ fontSize: 13 }}>
                      <code>{p.path}</code> ×{p.count}
                    </li>
                  ))}
                  {selectedProfile.profile.presence.topPaths.length === 0 && (
                    <li className="muted">No page events yet</li>
                  )}
                </ul>
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Products
                </div>
                <ul style={{ margin: "0.35rem 0", paddingLeft: "1.1rem" }}>
                  {Object.entries(selectedProfile.profile.products).map(
                    ([slug, p]) => (
                      <li key={slug} style={{ fontSize: 13 }}>
                        {p.name}:{" "}
                        <strong>{p.enrolled ? "using" : "not using"}</strong>
                      </li>
                    ),
                  )}
                </ul>
              </div>
              <pre
                style={{
                  fontSize: 11,
                  overflow: "auto",
                  maxHeight: 320,
                  background: "#0b0f14",
                  padding: "0.75rem",
                  borderRadius: 8,
                  margin: 0,
                }}
              >
                {JSON.stringify(selectedProfile.profile, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {view === "products" && (
        <>
          <div
            className="kyc-card"
            style={{
              marginBottom: "1rem",
              display: "grid",
              gap: "0.5rem",
              maxWidth: 560,
            }}
          >
            <strong>Add return product</strong>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              New products are pitched to users who are not enrolled. Use
              detectKey <code>manual</code> unless you wire auto-detection.
            </p>
            <input
              placeholder="slug (e.g. weekly_boost)"
              value={newProduct.slug}
              onChange={(e) =>
                setNewProduct((s) => ({ ...s, slug: e.target.value }))
              }
            />
            <input
              placeholder="Name"
              value={newProduct.name}
              onChange={(e) =>
                setNewProduct((s) => ({ ...s, name: e.target.value }))
              }
            />
            <input
              placeholder="Description"
              value={newProduct.description}
              onChange={(e) =>
                setNewProduct((s) => ({ ...s, description: e.target.value }))
              }
            />
            <input
              placeholder="Yield label (e.g. 2% weekly)"
              value={newProduct.yieldLabel}
              onChange={(e) =>
                setNewProduct((s) => ({ ...s, yieldLabel: e.target.value }))
              }
            />
            <select
              value={newProduct.cadence}
              onChange={(e) =>
                setNewProduct((s) => ({ ...s, cadence: e.target.value }))
              }
            >
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
            <button
              type="button"
              className="primary"
              disabled={busy !== null || !newProduct.slug || !newProduct.name}
              onClick={() =>
                void run(
                  "create",
                  () =>
                    api.productAgentCreateProduct({
                      ...newProduct,
                      detectKey: "manual",
                    }),
                  "Product created",
                ).then(() =>
                  setNewProduct({
                    slug: "",
                    name: "",
                    description: "",
                    cadence: "daily",
                    yieldLabel: "",
                  }),
                )
              }
            >
              {busy === "create" ? "Creating…" : "Create product"}
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Cadence</th>
                <th>Detect</th>
                <th>Enrolled</th>
                <th>Planned</th>
                <th>Launched</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div>{p.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {p.slug}
                    </div>
                  </td>
                  <td>
                    {p.cadence}
                    {p.yieldLabel ? ` · ${p.yieldLabel}` : ""}
                  </td>
                  <td>
                    <code>{p.detectKey}</code>
                  </td>
                  <td>{p._count.enrollments}</td>
                  <td>{p._count.plans}</td>
                  <td>{fmtDate(p.launchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
