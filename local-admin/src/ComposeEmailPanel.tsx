import { useCallback, useEffect, useState } from "react";
import { api, type UserRow } from "./api";

type Props = {
  onMessage: (msg: string) => void;
};

type Recipient = {
  id: string;
  displayName: string;
  email: string | null;
};

export function ComposeEmailPanel({ onMessage }: Props) {
  const [status, setStatus] = useState<{
    emailConfigured: boolean;
    emailFrom?: string;
    aiConfigured: boolean;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [allUsers, setAllUsers] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.composeEmailStatus());
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load compose status");
    }
  }, [onMessage]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearching(true);
      void api
        .users({ search: q, limit: 20 })
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [search]);

  function addRecipient(u: UserRow) {
    if (!u.email) {
      onMessage(`${u.displayName} has no email on file`);
      return;
    }
    setSelected((prev) =>
      prev.some((p) => p.id === u.id)
        ? prev
        : [...prev, { id: u.id, displayName: u.displayName, email: u.email }],
    );
    setAllUsers(false);
  }

  function removeRecipient(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }

  async function polish() {
    if (body.trim().length < 8) {
      onMessage("Write a draft first, then click AI to polish it.");
      return;
    }
    setPolishing(true);
    try {
      const res = await api.composeEmailPolish({ subject, body });
      setSubject(res.subject);
      setBody(res.body);
      onMessage("AI polished your email — review, then send.");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "AI polish failed");
    } finally {
      setPolishing(false);
    }
  }

  async function send() {
    if (!subject.trim() || body.trim().length < 8) {
      onMessage("Subject and body are required.");
      return;
    }
    if (!allUsers && selected.length === 0) {
      onMessage("Select users or choose Send to all users.");
      return;
    }
    if (allUsers) {
      const ok = window.confirm(
        "Send this email to ALL non-banned users with an email address? This cannot be undone.",
      );
      if (!ok) return;
    }

    setSending(true);
    setLastResult("");
    try {
      const res = await api.composeEmailSend({
        subject: subject.trim(),
        body: body.trim(),
        userIds: allUsers ? undefined : selected.map((s) => s.id),
        allUsers,
        confirmAll: allUsers,
      });
      const summary = `Sent ${res.sent}/${res.targeted} (failed ${res.failed}, skipped ${res.skipped})`;
      setLastResult(summary);
      onMessage(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      setLastResult(msg);
      onMessage(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="toolbar toolbar-wrap">
        <div>
          <h2>Compose email</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0", maxWidth: 620 }}>
            Search users, write a message, click the AI icon to make it professional,
            then send to selected people or everyone.
          </p>
        </div>
      </div>

      {status && (
        <div
          className="kyc-card"
          style={{
            marginBottom: "1rem",
            display: "flex",
            gap: "1.25rem",
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <span>
            Email:{" "}
            <strong style={{ color: status.emailConfigured ? "#34d399" : "#fbbf24" }}>
              {status.emailConfigured ? `ready (${status.emailFrom})` : "not configured"}
            </strong>
          </span>
          <span>
            AI polish:{" "}
            <strong style={{ color: status.aiConfigured ? "#34d399" : "#fbbf24" }}>
              {status.aiConfigured ? "ready" : "OPENAI_API_KEY missing"}
            </strong>
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 0.9fr) minmax(320px, 1.2fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        <div className="kyc-card" style={{ padding: "1rem" }}>
          <strong>Recipients</strong>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              margin: "0.85rem 0",
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={allUsers}
              onChange={(e) => {
                setAllUsers(e.target.checked);
                if (e.target.checked) setSelected([]);
              }}
            />
            Send to all users
          </label>

          {!allUsers && (
            <>
              <input
                type="search"
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", marginBottom: "0.5rem" }}
              />
              {searching && <p className="muted" style={{ fontSize: 12 }}>Searching…</p>}
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 4,
                        fontSize: 13,
                      }}
                      onClick={() => addRecipient(u)}
                    >
                      <div>{u.displayName}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {u.email ?? "no email"}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: "0.75rem" }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  Selected ({selected.length})
                </div>
                {selected.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13 }}>
                    No recipients yet
                  </p>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {selected.map((s) => (
                      <li
                        key={s.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          fontSize: 13,
                          padding: "0.35rem 0",
                          borderBottom: "1px solid #1e2936",
                        }}
                      >
                        <span>
                          {s.displayName}
                          <br />
                          <span className="muted" style={{ fontSize: 11 }}>
                            {s.email}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: "0.2rem 0.45rem" }}
                          onClick={() => removeRecipient(s.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {allUsers && (
            <p className="muted" style={{ fontSize: 13, marginTop: "0.5rem" }}>
              Will email every non-banned user who has a valid address. Confirm again
              when you hit Send.
            </p>
          )}
        </div>

        <div className="kyc-card" style={{ padding: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <strong>Message</strong>
            <button
              type="button"
              title="Rewrite with AI — keep meaning, make it professional"
              disabled={polishing || !status?.aiConfigured}
              onClick={() => void polish()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid #334155",
                background: polishing
                  ? "rgba(99, 102, 241, 0.25)"
                  : "rgba(99, 102, 241, 0.12)",
                color: "#c7d2fe",
                borderRadius: 999,
                padding: "0.4rem 0.75rem",
                cursor: polishing ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden
              >
                <path
                  d="M12 3l1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4L12 3z"
                  strokeLinejoin="round"
                />
                <path d="M18 14l.7 2.1L21 17l-2.3.9L18 20l-.7-2.1L15 17l2.3-.9L18 14z" />
                <path d="M5 15l.6 1.8L7.5 17.5 5.6 18 5 20l-.6-2L2.5 17.5 4.4 17 5 15z" />
              </svg>
              {polishing ? "Polishing…" : "AI polish"}
            </button>
          </div>

          <label className="muted" style={{ fontSize: 12 }}>
            Subject
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            style={{ width: "100%", margin: "0.35rem 0 0.85rem" }}
          />

          <label className="muted" style={{ fontSize: 12 }}>
            Body (use {"{{name}}"} for their display name)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your draft in plain language…"
            rows={14}
            style={{
              width: "100%",
              marginTop: "0.35rem",
              resize: "vertical",
              minHeight: 220,
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginTop: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              className="primary"
              disabled={sending || !status?.emailConfigured}
              onClick={() => void send()}
            >
              {sending
                ? "Sending…"
                : allUsers
                  ? "Send to all users"
                  : `Send to ${selected.length || 0} selected`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={polishing}
              onClick={() => void polish()}
            >
              {polishing ? "AI working…" : "Run AI polish"}
            </button>
          </div>

          {lastResult && (
            <p className="muted" style={{ marginTop: "0.75rem", fontSize: 13 }}>
              {lastResult}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
