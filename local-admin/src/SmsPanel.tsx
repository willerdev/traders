import { useCallback, useEffect, useState } from "react";
import { api, type SmsStatus, type SmsNumberRow } from "./api";

type Props = {
  onMessage: (msg: string) => void;
};

export function SmsPanel({ onMessage }: Props) {
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [numbers, setNumbers] = useState<SmsNumberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<"sms" | "whatsapp">("whatsapp");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [body, setBody] = useState("test");
  const [contentSid, setContentSid] = useState("");
  const [lastResult, setLastResult] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.smsStatus();
      setStatus(s);
      if (s.testTo) setTo(s.testTo);
      if (s.contentSid) setContentSid(s.contentSid);
      if (s.whatsappFrom || s.fromNumber) {
        setFrom(s.whatsappFrom || s.fromNumber || "");
      }
      if (s.configured) {
        try {
          const list = await api.smsNumbers();
          setNumbers(list.items);
          if (!from && list.defaultFrom) setFrom(list.defaultFrom);
        } catch {
          setNumbers([]);
        }
      } else {
        setNumbers([]);
      }
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load SMS status");
    } finally {
      setLoading(false);
    }
  }, [from, onMessage]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  async function send() {
    setSending(true);
    setLastResult("");
    try {
      const res = await api.smsTest({
        to: to.trim(),
        body: body.trim() || undefined,
        from: from.trim() || undefined,
        channel,
        contentSid:
          channel === "whatsapp" ? contentSid.trim() || undefined : undefined,
        contentVariables:
          channel === "whatsapp"
            ? { "1": body.trim() || "test" }
            : undefined,
      });
      const summary = `${res.message} · sid ${res.sid ?? "—"}`;
      setLastResult(summary);
      onMessage(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SMS send failed";
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
          <h2>SMS / WhatsApp (Twilio)</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            Temp test credentials from env. WhatsApp sandbox recipients must
            join first (error 63015 otherwise).
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Connection</h3>
        {loading && !status ? (
          <p className="muted">Checking Twilio config…</p>
        ) : (
          <dl className="kv">
            <dt>Status</dt>
            <dd>
              <span
                className={`badge ${status?.configured ? "approved" : "rejected"}`}
              >
                {status?.configured ? "Configured" : "Not configured"}
              </span>
            </dd>
            <dt>Account SID</dt>
            <dd>{status?.accountSidMasked ?? "—"}</dd>
            <dt>API key</dt>
            <dd>{status?.apiKeySidMasked ?? "—"}</dd>
            <dt>Auth token</dt>
            <dd>{status?.hasAuthToken ? "set" : "—"}</dd>
            <dt>WhatsApp from</dt>
            <dd>{status?.whatsappFrom ?? "—"}</dd>
            <dt>Content SID</dt>
            <dd>
              <code>{status?.contentSid ?? "—"}</code>
            </dd>
            <dt>Default to</dt>
            <dd>{status?.testTo ?? "—"}</dd>
            <dt>Note</dt>
            <dd>{status?.note ?? "—"}</dd>
          </dl>
        )}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Send test</h3>
        <div className="form-grid" style={{ maxWidth: 560 }}>
          <label>
            Channel
            <select
              value={channel}
              onChange={(e) =>
                setChannel(e.target.value === "sms" ? "sms" : "whatsapp")
              }
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </label>
          <label>
            To
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={
                channel === "whatsapp"
                  ? "whatsapp:+2567xxxxxxx"
                  : "+2567xxxxxxx"
              }
              autoComplete="tel"
            />
          </label>
          <label>
            From
            {numbers.length > 0 ? (
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Select sender…</option>
                {numbers.map((n) => (
                  <option key={n.sid || n.phoneNumber} value={n.phoneNumber}>
                    {n.phoneNumber}
                    {n.friendlyName ? ` · ${n.friendlyName}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="whatsapp:+14155238886"
              />
            )}
          </label>
          {channel === "whatsapp" && (
            <label>
              Content SID (template)
              <input
                value={contentSid}
                onChange={(e) => setContentSid(e.target.value)}
                placeholder="HX…"
              />
            </label>
          )}
          <label>
            {channel === "whatsapp" ? "Template var {{1}}" : "Message"}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
          </label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="primary"
              disabled={sending || !status?.configured || !to.trim()}
              onClick={() => void send()}
            >
              {sending ? "Sending…" : "Send test"}
            </button>
            {lastResult && <span className="muted">{lastResult}</span>}
          </div>
        </div>
      </div>
    </>
  );
}
