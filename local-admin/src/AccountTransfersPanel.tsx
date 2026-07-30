import { useCallback, useEffect, useState } from "react";
import { api, type AccountTransferRow } from "./api";

type Props = {
  onMessage: (msg: string) => void;
};

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function AccountTransfersPanel({ onMessage }: Props) {
  const [items, setItems] = useState<AccountTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void api
      .accountTransfers({
        limit: 50,
        status: statusFilter || undefined,
      })
      .then((res) => setItems(res.items))
      .catch((e) =>
        onMessage(e instanceof Error ? e.message : "Failed to load transfers"),
      )
      .finally(() => setLoading(false));
  }, [onMessage, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Account asset transfers</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Move balances + history from a duplicate/unwanted account onto the keep
            account. Destination user must agree; funds finalize after 24 hours.
          </p>
        </div>
        <button type="button" className="ghost" onClick={() => load()}>
          Refresh
        </button>
      </div>

      <div className="kyc-card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem" }}>Start transfer</h3>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "end",
          }}
        >
          <label>
            From email (unwanted)
            <input
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="typo@gmail.comm"
              style={{ display: "block", minWidth: "16rem" }}
            />
          </label>
          <label>
            To email (keep)
            <input
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="correct@gmail.com"
              style={{ display: "block", minWidth: "16rem" }}
            />
          </label>
          <label>
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Duplicate signup / typo"
              style={{ display: "block", minWidth: "12rem" }}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={creating || !fromEmail.trim() || !toEmail.trim()}
            onClick={() => {
              setCreating(true);
              void api
                .createAccountTransfer({
                  fromEmail: fromEmail.trim(),
                  toEmail: toEmail.trim(),
                  note: note.trim() || undefined,
                })
                .then((row) => {
                  onMessage(
                    `Transfer ${row.id} created — agreement emailed to ${row.toUser?.email ?? "destination"}.`,
                  );
                  setFromEmail("");
                  setToEmail("");
                  setNote("");
                  load();
                })
                .catch((e) =>
                  onMessage(e instanceof Error ? e.message : "Create failed"),
                )
                .finally(() => setCreating(false));
            }}
          >
            {creating ? "Creating…" : "Create & email"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: "0.75rem" }}>
        <label>
          Status filter{" "}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="PENDING_USER">Pending user</option>
            <option value="IN_REVIEW">In review</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="FAILED">Failed</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No transfers yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>From → To</th>
                <th>Timeline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.status}</strong>
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {row.id.slice(0, 10)}…
                    </div>
                    {row.failureReason ? (
                      <div className="muted" style={{ color: "#f87171" }}>
                        {row.failureReason}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div>
                      {row.fromUser?.displayName}{" "}
                      <span className="muted">
                        ({row.fromUser?.email ?? row.fromUserId.slice(0, 8)})
                      </span>
                    </div>
                    <div style={{ marginTop: "0.25rem" }}>
                      → {row.toUser?.displayName}{" "}
                      <span className="muted">
                        ({row.toUser?.email ?? row.toUserId.slice(0, 8)})
                      </span>
                    </div>
                    {row.adminNote ? (
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        {row.adminNote}
                      </div>
                    ) : null}
                  </td>
                  <td className="muted" style={{ fontSize: "0.85rem" }}>
                    <div>Created {fmtWhen(row.createdAt)}</div>
                    <div>Agreed {fmtWhen(row.userAgreedAt)}</div>
                    <div>Finalize after {fmtWhen(row.finalizeAfter)}</div>
                    <div>Completed {fmtWhen(row.completedAt)}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      {row.status === "PENDING_USER" ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={busyId === row.id}
                          onClick={() => {
                            if (!window.confirm("Cancel this pending transfer?")) {
                              return;
                            }
                            setBusyId(row.id);
                            void api
                              .cancelAccountTransfer(row.id)
                              .then(() => {
                                onMessage(`Cancelled ${row.id}`);
                                load();
                              })
                              .catch((e) =>
                                onMessage(
                                  e instanceof Error ? e.message : "Cancel failed",
                                ),
                              )
                              .finally(() => setBusyId(null));
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                      {row.status === "IN_REVIEW" ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={busyId === row.id}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Finalize now (skip remaining 24h hold)? Source will be banned immediately.",
                              )
                            ) {
                              return;
                            }
                            setBusyId(row.id);
                            void api
                              .finalizeAccountTransfer(row.id)
                              .then(() => {
                                onMessage(`Finalized ${row.id}`);
                                load();
                              })
                              .catch((e) =>
                                onMessage(
                                  e instanceof Error
                                    ? e.message
                                    : "Finalize failed",
                                ),
                              )
                              .finally(() => setBusyId(null));
                          }}
                        >
                          Finalize now
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
