import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DerivSettings } from "./api";

type Props = {
  onMessage: (msg: string) => void;
};

type Draft = {
  appId: string;
  apiToken: string;
  endpoint: string;
  oauthRedirectUrl: string;
  enabled: boolean;
  notes: string;
};

const EMPTY: Draft = {
  appId: "",
  apiToken: "",
  endpoint: "wss://ws.derivws.com/websockets/v3",
  oauthRedirectUrl: "",
  enabled: false,
  notes: "",
};

const STEPS = [
  {
    id: "credentials",
    label: "Credentials",
    blurb: "App ID and API token from api.deriv.com",
  },
  {
    id: "connection",
    label: "Connection",
    blurb: "WebSocket endpoint and OAuth redirect",
  },
  {
    id: "review",
    label: "Review & save",
    blurb: "Confirm settings and enable the integration",
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function DerivPanel({ onMessage }: Props) {
  const [data, setData] = useState<DerivSettings | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [step, setStep] = useState<StepId>("credentials");

  const applyServer = useCallback((res: DerivSettings) => {
    setData(res);
    setDraft({
      appId: res.appId || "",
      apiToken: res.hasApiToken ? res.apiTokenMasked : "",
      endpoint: res.endpoint || EMPTY.endpoint,
      oauthRedirectUrl: res.oauthRedirectUrl || "",
      enabled: Boolean(res.enabled),
      notes: res.notes || "",
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      applyServer(await api.derivSettings());
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load Deriv settings");
    } finally {
      setLoading(false);
    }
  }, [applyServer, onMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const credentialsOk = draft.appId.trim().length > 0;
  const connectionOk =
    draft.endpoint.trim().startsWith("wss://") ||
    draft.endpoint.trim().startsWith("ws://");
  const tokenPresent =
    Boolean(draft.apiToken && !draft.apiToken.includes("•")) ||
    Boolean(data?.hasApiToken && draft.apiToken.includes("•"));

  const stepStatus = useMemo(
    () => ({
      credentials: credentialsOk ? ("done" as const) : ("todo" as const),
      connection: connectionOk ? ("done" as const) : ("todo" as const),
      review: "todo" as const,
    }),
    [credentialsOk, connectionOk],
  );

  async function save() {
    if (!credentialsOk) {
      onMessage("App ID is required");
      setStep("credentials");
      return;
    }
    if (!connectionOk) {
      onMessage("WebSocket endpoint must start with wss:// or ws://");
      setStep("connection");
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof api.updateDerivSettings>[0] = {
        appId: draft.appId,
        endpoint: draft.endpoint,
        oauthRedirectUrl: draft.oauthRedirectUrl,
        enabled: draft.enabled,
        notes: draft.notes,
      };
      // Only send token when the user typed a new value (not the masked placeholder).
      if (draft.apiToken && !draft.apiToken.includes("•")) {
        payload.apiToken = draft.apiToken;
      } else if (!draft.apiToken && data?.hasApiToken) {
        payload.apiToken = "";
      }
      applyServer(await api.updateDerivSettings(payload));
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2800);
      onMessage("Deriv settings saved");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    if (step === "credentials" && !credentialsOk) return;
    if (step === "connection" && !connectionOk) return;
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1].id);
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1].id);
    }
  }

  const canContinue =
    (step === "credentials" && credentialsOk) ||
    (step === "connection" && connectionOk);
  const canSave = credentialsOk && connectionOk;

  const docsUrl = data?.docsUrl || "https://developers.deriv.com/docs/websockets";

  return (
    <section className="engine-page">
      <header className="engine-head">
        <div>
          <p className="engine-eyebrow">Integrations</p>
          <h2 className="engine-title">Deriv</h2>
          <p className="engine-desc muted">
            Guided setup for the Deriv WebSocket API. Register an app at{" "}
            <a href="https://api.deriv.com/" target="_blank" rel="noreferrer">
              api.deriv.com
            </a>
            , then walk through credentials, connection, and save.
          </p>
        </div>
        <div className="engine-head-actions">
          <button
            type="button"
            className="wallet-icon-btn"
            disabled={loading}
            onClick={() => void refresh()}
            title="Refresh"
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </header>

      {loading && !data ? (
        <p className="muted">Loading Deriv settings…</p>
      ) : (
        <div className="setup-shell">
          <div className="setup-hero setup-hero-deriv">
            <div>
              <p className="engine-hero-label">Integration status</p>
              <p className="setup-hero-status">
                {draft.enabled ? "Enabled" : "Disabled"}
                {data?.hasApiToken ? " · token stored" : " · no token yet"}
              </p>
              <p className="engine-hero-sub">
                Step {stepIndex + 1} of {STEPS.length} — {STEPS[stepIndex].label}
              </p>
            </div>
            <div className="setup-hero-links">
              <a href="https://api.deriv.com/" target="_blank" rel="noreferrer">
                Register app →
              </a>
              <a href={docsUrl} target="_blank" rel="noreferrer">
                WebSocket docs →
              </a>
            </div>
          </div>

          <nav className="setup-steps" aria-label="Setup steps">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < stepIndex || (i < 2 && stepStatus[s.id] === "done");
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`setup-step${active ? " active" : ""}${done ? " done" : ""}`}
                  onClick={() => setStep(s.id)}
                >
                  <span className="setup-step-num">{i + 1}</span>
                  <span className="setup-step-copy">
                    <strong>{s.label}</strong>
                    <em>{s.blurb}</em>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="setup-body">
            {step === "credentials" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 1 — Credentials</h3>
                  <p className="muted">
                    Create an application on Deriv, copy the numeric App ID, and
                    generate an API token with the scopes you need (read / trade).
                  </p>
                </div>
                <div className="form-grid config-form-grid setup-form">
                  <label>
                    App ID
                    <input
                      value={draft.appId}
                      onChange={(e) => setField("appId", e.target.value)}
                      placeholder="e.g. 1089"
                      autoComplete="off"
                    />
                    <span className="field-hint">
                      Required. Found in your Deriv app dashboard after registration.
                    </span>
                  </label>
                  <label>
                    API token
                    <input
                      type="password"
                      value={draft.apiToken}
                      onChange={(e) => setField("apiToken", e.target.value)}
                      placeholder={
                        data?.hasApiToken
                          ? "•••• (leave as-is to keep, clear to remove)"
                          : "Paste Deriv API token"
                      }
                      autoComplete="new-password"
                    />
                    <span className="field-hint">
                      {tokenPresent
                        ? "Token on file — paste a new value only to rotate."
                        : "Authorize after connect with { \"authorize\": \"<token>\" }."}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {step === "connection" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 2 — Connection</h3>
                  <p className="muted">
                    Default endpoint works for most apps. Set an OAuth redirect only
                    if you use Deriv OAuth login.
                  </p>
                </div>
                <div className="form-grid config-form-grid setup-form">
                  <label className="span-2">
                    WebSocket endpoint
                    <input
                      value={draft.endpoint}
                      onChange={(e) => setField("endpoint", e.target.value)}
                      placeholder="wss://ws.derivws.com/websockets/v3"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="field-hint">
                      Must start with <code>wss://</code>. App ID is appended as a
                      query param when connecting.
                    </span>
                  </label>
                  <label className="span-2">
                    OAuth redirect URL (optional)
                    <input
                      value={draft.oauthRedirectUrl}
                      onChange={(e) => setField("oauthRedirectUrl", e.target.value)}
                      placeholder="https://your-app.example/oauth/deriv"
                      autoComplete="off"
                    />
                    <span className="field-hint">
                      Leave blank if you only use token authorize over WebSocket.
                    </span>
                  </label>
                </div>
                {data?.websocketUrl && (
                  <p className="setup-callout muted">
                    Resolved connect URL: <code>{data.websocketUrl}</code>
                  </p>
                )}
              </div>
            )}

            {step === "review" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 3 — Review & save</h3>
                  <p className="muted">
                    Confirm values, add operator notes, then enable when ready.
                  </p>
                </div>

                <dl className="setup-review">
                  <div>
                    <dt>App ID</dt>
                    <dd>
                      <code>{draft.appId || "—"}</code>
                      {!credentialsOk && (
                        <span className="setup-warn"> Required</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>API token</dt>
                    <dd>{tokenPresent ? "Stored / set" : "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Endpoint</dt>
                    <dd>
                      <code className="break-all">{draft.endpoint || "—"}</code>
                      {!connectionOk && (
                        <span className="setup-warn"> Invalid</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>OAuth redirect</dt>
                    <dd>
                      <code className="break-all">
                        {draft.oauthRedirectUrl || "—"}
                      </code>
                    </dd>
                  </div>
                </dl>

                <label className="config-toggle setup-enable">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setField("enabled", e.target.checked)}
                  />
                  <span>Enable Deriv API connection</span>
                </label>

                <div className="form-grid config-form-grid setup-form">
                  <label className="span-2">
                    Notes
                    <textarea
                      rows={3}
                      value={draft.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                      placeholder="Account labels, scopes, which environment (demo/real)…"
                    />
                  </label>
                </div>

                {savedFlash && (
                  <p className="setup-saved" role="status">
                    Settings saved successfully
                  </p>
                )}
              </div>
            )}

            <div className="setup-footer">
              <button
                type="button"
                className="ghost"
                onClick={goBack}
                disabled={stepIndex === 0}
              >
                Back
              </button>
              <div className="setup-footer-right">
                {step !== "review" ? (
                  <button type="button" onClick={goNext} disabled={!canContinue}>
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || loading || !canSave}
                  >
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
