import { useEffect, useState, type ReactNode } from "react";
import { api, type AdminUserDetail } from "./api";
import { AdminImage } from "./AdminImage";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtMoney(n: number | string | null | undefined) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="user-detail-field">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value ?? "—"}</dd>
    </div>
  );
}

type UserDetailModalProps = {
  userId: string | null;
  onClose: () => void;
  onChat?: (userId: string, displayName: string) => void;
  onKycUpdated?: () => void;
  canManagePermissions?: boolean;
};

export function UserDetailModal({
  userId,
  onClose,
  onChat,
  onKycUpdated,
  canManagePermissions = false,
}: UserDetailModalProps) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kycBusy, setKycBusy] = useState(false);
  const [permissionsBusy, setPermissionsBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [staffKyc, setStaffKyc] = useState(false);
  const [staffPayout, setStaffPayout] = useState(false);
  const [staffTpClaim, setStaffTpClaim] = useState(false);
  const [staffSetups, setStaffSetups] = useState(false);
  const [permissionsMessage, setPermissionsMessage] = useState("");

  const reload = () => {
    if (!userId) return;
    setLoading(true);
    setError("");
    void api
      .getUser(userId)
      .then(setDetail)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!userId) {
      setDetail(null);
      setError("");
      setRejectReason("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void api
      .getUser(userId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!detail) return;
    setStaffKyc(Boolean(detail.adminCanApproveKyc));
    setStaffPayout(Boolean(detail.adminCanApprovePayouts));
    setStaffTpClaim(Boolean(detail.adminCanApproveTpClaims));
    setStaffSetups(Boolean(detail.adminCanManageSetups));
  }, [detail]);

  if (!userId) return null;

  const profile = detail?.profile;
  const kyc = detail?.kyc;

  async function approveKyc() {
    if (!userId) return;
    setKycBusy(true);
    setError("");
    try {
      await api.approveKyc(userId);
      reload();
      onKycUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC approval failed");
    } finally {
      setKycBusy(false);
    }
  }

  async function rejectKyc() {
    if (!userId) return;
    setKycBusy(true);
    setError("");
    try {
      await api.rejectKyc(userId, rejectReason.trim() || "Documents unclear");
      setRejectReason("");
      reload();
      onKycUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC rejection failed");
    } finally {
      setKycBusy(false);
    }
  }

  async function saveStaffPermissions() {
    if (!userId) return;
    setPermissionsBusy(true);
    setError("");
    setPermissionsMessage("");
    try {
      const updated = await api.updateStaffPermissions(userId, {
        canApproveKyc: staffKyc,
        canApprovePayouts: staffPayout,
        canApproveTpClaims: staffTpClaim,
        canManageSetups: staffSetups,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              adminCanApproveKyc: updated.adminCanApproveKyc,
              adminCanApprovePayouts: updated.adminCanApprovePayouts,
              adminCanApproveTpClaims: updated.adminCanApproveTpClaims,
              adminCanManageSetups: updated.adminCanManageSetups,
            }
          : prev,
      );
      setPermissionsMessage("Permissions saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update staff permissions",
      );
    } finally {
      setPermissionsBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal modal-user-detail"
        role="dialog"
        aria-labelledby="user-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-user-header">
          <div>
            <h3 id="user-detail-title">{detail?.displayName ?? "User"}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {detail?.email ?? "Loading…"}
            </p>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {loading && <p className="muted">Loading user details…</p>}
        {error && <p className="error-text">{error}</p>}

        {detail && !loading && (
          <div className="user-detail-body">
            <section className="user-detail-section">
              <h4>Account</h4>
              <dl className="user-detail-grid">
                <Field label="Status" value={detail.status} />
                <Field label="Role" value={detail.role} />
                <Field label="Registration paid" value={detail.registrationPaid ? "Yes" : "No"} />
                <Field label="Access expires" value={fmtDate(detail.accessExpiresAt)} />
                <Field label="Email verified" value={detail.emailVerified ? "Yes" : "No"} />
                <Field label="Login wallet" value={detail.walletAddress} mono />
                <Field label="Last login IP" value={detail.lastLoginIp} mono />
                <Field label="Joined" value={fmtDate(detail.createdAt)} />
                <Field label="Setups submitted" value={detail.counts.signals} />
                {detail.emailAssessment?.suspicious && (
                  <Field
                    label="Email flags"
                    value={detail.emailAssessment.reasons.join(", ")}
                  />
                )}
              </dl>
            </section>

            {canManagePermissions && detail.role !== "ADMIN" && (
              <section className="user-detail-section">
                <h4>Admin hub permissions</h4>
                <p className="muted" style={{ marginTop: 0 }}>
                  Grant access to specific review queues in the local admin panel.
                </p>
                <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={staffKyc}
                      disabled={permissionsBusy}
                      onChange={(e) => setStaffKyc(e.target.checked)}
                    />
                    <span>KYC approver</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={staffPayout}
                      disabled={permissionsBusy}
                      onChange={(e) => setStaffPayout(e.target.checked)}
                    />
                    <span>Payout approver</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={staffTpClaim}
                      disabled={permissionsBusy}
                      onChange={(e) => setStaffTpClaim(e.target.checked)}
                    />
                    <span>TP claim approver</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={staffSetups}
                      disabled={permissionsBusy}
                      onChange={(e) => setStaffSetups(e.target.checked)}
                    />
                    <span>Setup reviewer — view setups and send to MT5 Copy</span>
                  </label>
                </div>
                {permissionsMessage && (
                  <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                    {permissionsMessage}
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={permissionsBusy}
                  onClick={() => void saveStaffPermissions()}
                >
                  {permissionsBusy ? "Saving…" : "Save permissions"}
                </button>
              </section>
            )}

            {detail.virtualAccount && (
              <section className="user-detail-section">
                <h4>Virtual account</h4>
                <dl className="user-detail-grid">
                  <Field label="Tier" value={detail.virtualAccount.tier} />
                  <Field label="Balance" value={fmtMoney(detail.virtualAccount.balance)} />
                  <Field label="Score" value={detail.virtualAccount.score} />
                  <Field label="Total profit" value={fmtMoney(detail.virtualAccount.totalProfit)} />
                  <Field label="Weekly profit" value={fmtMoney(detail.virtualAccount.weeklyProfit)} />
                  <Field label="Win rate" value={`${detail.virtualAccount.winRate}%`} />
                  <Field
                    label="Trades"
                    value={`${detail.virtualAccount.winningTrades}W / ${detail.virtualAccount.losingTrades}L (${detail.virtualAccount.totalTrades} total)`}
                  />
                </dl>
              </section>
            )}

            <section className="user-detail-section">
              <h4>Profile & payout wallets</h4>
              {profile ? (
                <dl className="user-detail-grid">
                  <Field
                    label="Name"
                    value={[profile.firstName, profile.lastName].filter(Boolean).join(" ") || "—"}
                  />
                  <Field label="Phone" value={profile.phone} />
                  <Field label="Date of birth" value={fmtDate(profile.dateOfBirth)} />
                  <Field
                    label="Location"
                    value={[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "—"}
                  />
                  <Field label="Address" value={profile.addressLine1} />
                  <Field label="Address line 2" value={profile.addressLine2} />
                  <Field label="Postal code" value={profile.postalCode} />
                  <Field label="Payout method" value={profile.payoutMethod} />
                  <Field label="USDT TRC20" value={profile.trc20Address} mono />
                  <Field label="Mobile provider" value={profile.mobileMoneyProvider} />
                  <Field label="Mobile number" value={profile.mobileMoneyNumber} />
                  <Field label="Mobile account name" value={profile.mobileMoneyAccountName} />
                </dl>
              ) : (
                <p className="muted">No profile submitted yet.</p>
              )}
            </section>

            <section className="user-detail-section">
              <h4>KYC documents</h4>
              {kyc && kyc.status !== "NOT_STARTED" ? (
                <>
                  <dl className="user-detail-grid">
                    <Field label="KYC status" value={kyc.status} />
                    <Field label="Document type" value={kyc.documentType} />
                    <Field label="Document number" value={kyc.documentNumber} mono />
                    <Field label="Submitted" value={fmtDate(kyc.submittedAt)} />
                    <Field label="Reviewed" value={fmtDate(kyc.reviewedAt)} />
                    {kyc.rejectionReason && (
                      <Field label="Rejection reason" value={kyc.rejectionReason} />
                    )}
                  </dl>
                  <div className="user-detail-kyc-images">
                    {kyc.documentFrontUrl && (
                      <div>
                        <p className="muted user-detail-img-label">Document front</p>
                        <AdminImage src={kyc.documentFrontUrl} alt="Document front" />
                      </div>
                    )}
                    {kyc.documentBackUrl && (
                      <div>
                        <p className="muted user-detail-img-label">Document back</p>
                        <AdminImage src={kyc.documentBackUrl} alt="Document back" />
                      </div>
                    )}
                    {kyc.selfieUrl && (
                      <div>
                        <p className="muted user-detail-img-label">Selfie</p>
                        <AdminImage src={kyc.selfieUrl} alt="Selfie" />
                      </div>
                    )}
                  </div>
                  {kyc.status === "PENDING" && (
                    <div style={{ marginTop: "1rem" }}>
                      <input
                        placeholder="Rejection reason (if rejecting)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
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
                          disabled={kycBusy}
                          onClick={() => void approveKyc()}
                        >
                          {kycBusy ? "…" : "Approve KYC"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={kycBusy}
                          onClick={() => void rejectKyc()}
                        >
                          {kycBusy ? "…" : "Reject KYC"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">KYC not submitted.</p>
              )}
            </section>

            <section className="user-detail-section">
              <h4>Registration payments</h4>
              {detail.payments.length === 0 ? (
                <p className="muted">No payments on record.</p>
              ) : (
                <table className="user-detail-table">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Network</th>
                      <th>Status</th>
                      <th>Tx</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtMoney(p.amount)}</td>
                        <td>{p.network}</td>
                        <td>{p.status}</td>
                        <td className="mono muted">{p.txHash ? `${p.txHash.slice(0, 10)}…` : "—"}</td>
                        <td>{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="user-detail-section">
              <h4>Payout history</h4>
              {detail.payouts.length === 0 ? (
                <p className="muted">No payout requests.</p>
              ) : (
                <table className="user-detail-table">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Destination</th>
                      <th>Status</th>
                      <th>Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payouts.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtMoney(p.traderShare)}</td>
                        <td>{p.payoutMethod ?? "—"}</td>
                        <td className="mono muted">{p.walletAddress ?? "—"}</td>
                        <td>{p.status}</td>
                        <td>{fmtDate(p.requestedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {detail.tpClaims.length > 0 && (
              <section className="user-detail-section">
                <h4>Recent TP claims</h4>
                <table className="user-detail-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.tpClaims.map((c) => (
                      <tr key={c.id}>
                        <td>{c.symbol}</td>
                        <td>{c.claimType ?? "FULL_TP"}</td>
                        <td>{c.status}</td>
                        <td>{fmtDate(c.submittedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {detail.walletTransactions.length > 0 && (
              <section className="user-detail-section">
                <h4>Wallet ledger</h4>
                <table className="user-detail-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Description</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.walletTransactions.map((t) => (
                      <tr key={t.id}>
                        <td>{t.type}</td>
                        <td>{fmtMoney(t.amount)}</td>
                        <td className="muted">{t.description}</td>
                        <td>{fmtDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        {detail && onChat && (
          <div className="modal-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                onChat(detail.id, detail.displayName);
                onClose();
              }}
            >
              Open chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
