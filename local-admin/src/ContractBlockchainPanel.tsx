import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ContractBlockchainSettings } from "./api";

type Props = {
  onMessage: (msg: string) => void;
};

type Draft = {
  contractAddress: string;
  chainId: string;
  networkLabel: string;
  networkKind: string;
  abi: string;
  rpcUrl: string;
  adminWallet: string;
  explorerUrl: string;
  remixRef: string;
  notes: string;
};

const EMPTY: Draft = {
  contractAddress: "",
  chainId: "",
  networkLabel: "",
  networkKind: "",
  abi: "",
  rpcUrl: "",
  adminWallet: "",
  explorerUrl: "",
  remixRef: "",
  notes: "",
};

const NETWORK_PRESETS: Array<{
  label: string;
  kind: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
}> = [
  {
    label: "Polygon Amoy",
    kind: "polygon",
    chainId: 80002,
    rpcUrl: "https://polygon-amoy-bor-rpc.publicnode.com",
    explorerUrl: "https://amoy.polygonscan.com",
  },
  {
    label: "BNB Smart Chain",
    kind: "bsc",
    chainId: 56,
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com",
  },
  {
    label: "BNB Testnet",
    kind: "bsc",
    chainId: 97,
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/",
    explorerUrl: "https://testnet.bscscan.com",
  },
  {
    label: "Ethereum",
    kind: "ethereum",
    chainId: 1,
    rpcUrl: "https://ethereum.publicnode.com",
    explorerUrl: "https://etherscan.io",
  },
];

const STEPS = [
  {
    id: "network",
    label: "Network",
    blurb: "Chain ID, label, and explorer",
  },
  {
    id: "contract",
    label: "Contract",
    blurb: "Address, admin wallet, Remix ref",
  },
  {
    id: "abi",
    label: "ABI & RPC",
    blurb: "JSON ABI and JSON-RPC endpoint",
  },
  {
    id: "review",
    label: "Review & save",
    blurb: "Confirm effective config and save",
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function looksLikeAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

function abiLooksOk(raw: string) {
  const t = raw.trim();
  if (!t) return false;
  try {
    const parsed = JSON.parse(t) as unknown;
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function ContractBlockchainPanel({ onMessage }: Props) {
  const [data, setData] = useState<ContractBlockchainSettings | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [step, setStep] = useState<StepId>("network");

  const applyServer = useCallback((res: ContractBlockchainSettings) => {
    setData(res);
    setDraft({
      contractAddress: res.contractAddress || "",
      chainId: res.chainId != null ? String(res.chainId) : "",
      networkLabel: res.networkLabel || "",
      networkKind: res.networkKind || "",
      abi: res.abi || "",
      rpcUrl: res.rpcUrl || "",
      adminWallet: res.adminWallet || "",
      explorerUrl: res.explorerUrl || "",
      remixRef: res.remixRef || "",
      notes: res.notes || "",
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      applyServer(await api.contractBlockchainSettings());
    } catch (err) {
      onMessage(
        err instanceof Error ? err.message : "Failed to load contract settings",
      );
    } finally {
      setLoading(false);
    }
  }, [applyServer, onMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const chainIdNum = Number(draft.chainId.trim());
  const networkOk =
    draft.chainId.trim() !== "" &&
    Number.isFinite(chainIdNum) &&
    chainIdNum > 0 &&
    draft.networkLabel.trim().length > 0;
  const contractOk = looksLikeAddress(draft.contractAddress);
  const abiRpcOk =
    draft.rpcUrl.trim().startsWith("http") &&
    (draft.abi.trim() === "" || abiLooksOk(draft.abi));

  function applyPreset(chainId: number) {
    const preset = NETWORK_PRESETS.find((p) => p.chainId === chainId);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      chainId: String(preset.chainId),
      networkLabel: preset.label,
      networkKind: preset.kind,
      rpcUrl: prev.rpcUrl || preset.rpcUrl,
      explorerUrl: prev.explorerUrl || preset.explorerUrl,
    }));
  }

  async function save() {
    const chainIdRaw = draft.chainId.trim();
    const chainId = chainIdRaw === "" ? undefined : Number(chainIdRaw);
    if (chainIdRaw !== "" && (!Number.isFinite(chainId) || (chainId ?? 0) <= 0)) {
      onMessage("chainId must be a positive number");
      setStep("network");
      setSaving(false);
      return;
    }
    if (draft.abi.trim() && !abiLooksOk(draft.abi)) {
      onMessage("ABI must be valid JSON array");
      setStep("abi");
      return;
    }
    setSaving(true);
    try {
      applyServer(
        await api.updateContractBlockchainSettings({
          contractAddress: draft.contractAddress,
          chainId: chainId ?? null,
          networkLabel: draft.networkLabel,
          networkKind: draft.networkKind,
          abi: draft.abi,
          rpcUrl: draft.rpcUrl,
          adminWallet: draft.adminWallet,
          explorerUrl: draft.explorerUrl,
          remixRef: draft.remixRef,
          notes: draft.notes,
        }),
      );
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2800);
      onMessage("Contract blockchain settings saved");
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
    if (step === "network" && !networkOk) return;
    if (step === "contract" && !contractOk) return;
    if (step === "abi" && !abiRpcOk) return;
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
    (step === "network" && networkOk) ||
    (step === "contract" && contractOk) ||
    (step === "abi" && abiRpcOk);
  const canSave =
    networkOk &&
    contractOk &&
    abiRpcOk &&
    (!draft.abi.trim() || abiLooksOk(draft.abi));

  const effective = data?.effective;
  const remixUrl = data?.remixUrl || "https://remix.ethereum.org/";

  const progressHint = useMemo(() => {
    const parts: string[] = [];
    if (networkOk) parts.push("network");
    if (contractOk) parts.push("address");
    if (abiRpcOk) parts.push("rpc");
    return parts.length
      ? `${parts.join(" · ")} ready`
      : "Fill network, address, and RPC to configure";
  }, [networkOk, contractOk, abiRpcOk]);

  return (
    <section className="engine-page">
      <header className="engine-head">
        <div>
          <p className="engine-eyebrow">On-chain</p>
          <h2 className="engine-title">Contract blockchain</h2>
          <p className="engine-desc muted">
            Guided setup for the vault you are launching. Deploy from{" "}
            <a href={remixUrl} target="_blank" rel="noreferrer">
              Remix IDE
            </a>
            , then enter network, contract, ABI/RPC, and save. Values override
            env and feed <code>/blockchain/contract/config</code>.
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
        <p className="muted">Loading contract settings…</p>
      ) : (
        <div className="setup-shell">
          <div className="setup-hero setup-hero-chain">
            <div>
              <p className="engine-hero-label">Effective config</p>
              <p className="setup-hero-status">
                {effective?.configured ? "Configured" : "Not configured"}
                {effective?.networkLabel
                  ? ` · ${effective.networkLabel}`
                  : draft.networkLabel
                    ? ` · ${draft.networkLabel}`
                    : ""}
              </p>
              <p className="engine-hero-sub">
                Step {stepIndex + 1} of {STEPS.length} — {STEPS[stepIndex].label}
                {" · "}
                {progressHint}
              </p>
            </div>
            <div className="setup-hero-links">
              <a href={remixUrl} target="_blank" rel="noreferrer">
                Open Remix →
              </a>
              {effective?.explorerUrl ? (
                <a href={effective.explorerUrl} target="_blank" rel="noreferrer">
                  Explorer →
                </a>
              ) : null}
            </div>
          </div>

          <nav className="setup-steps" aria-label="Setup steps">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done =
                (s.id === "network" && networkOk) ||
                (s.id === "contract" && contractOk) ||
                (s.id === "abi" && abiRpcOk) ||
                i < stepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`setup-step${active ? " active" : ""}${done && !active ? " done" : ""}`}
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
            {step === "network" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 1 — Network</h3>
                  <p className="muted">
                    Pick a preset to fill chain ID, RPC, and explorer, or enter
                    custom values. Presets never overwrite an RPC you already set.
                  </p>
                </div>
                <div className="config-presets setup-presets">
                  <span className="muted">Presets:</span>
                  {NETWORK_PRESETS.map((p) => (
                    <button
                      key={p.chainId}
                      type="button"
                      className={`ghost compact${
                        draft.chainId === String(p.chainId) ? " preset-active" : ""
                      }`}
                      onClick={() => applyPreset(p.chainId)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="form-grid config-form-grid setup-form setup-form-2">
                  <label>
                    Chain ID
                    <input
                      value={draft.chainId}
                      onChange={(e) => setField("chainId", e.target.value)}
                      placeholder="80002"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <span className="field-hint">Positive integer (e.g. 80002 Amoy).</span>
                  </label>
                  <label>
                    Network label
                    <input
                      value={draft.networkLabel}
                      onChange={(e) => setField("networkLabel", e.target.value)}
                      placeholder="Polygon Amoy"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Network kind
                    <input
                      value={draft.networkKind}
                      onChange={(e) => setField("networkKind", e.target.value)}
                      placeholder="polygon | bsc | ethereum"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Explorer URL
                    <input
                      value={draft.explorerUrl}
                      onChange={(e) => setField("explorerUrl", e.target.value)}
                      placeholder="https://amoy.polygonscan.com"
                      autoComplete="off"
                    />
                  </label>
                </div>
              </div>
            )}

            {step === "contract" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 2 — Contract details</h3>
                  <p className="muted">
                    After Remix deploy, paste the contract address and optional
                    owner wallet / project reference.
                  </p>
                </div>
                <div className="form-grid config-form-grid setup-form">
                  <label className="span-2">
                    Contract address
                    <input
                      value={draft.contractAddress}
                      onChange={(e) => setField("contractAddress", e.target.value)}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      className="mono-input"
                    />
                    <span className="field-hint">
                      {draft.contractAddress.trim()
                        ? contractOk
                          ? "Valid 40-byte hex address."
                          : "Expected 0x + 40 hex characters."
                        : "Required for a configured vault."}
                    </span>
                  </label>
                  <label className="span-2">
                    Admin / owner wallet
                    <input
                      value={draft.adminWallet}
                      onChange={(e) => setField("adminWallet", e.target.value)}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      className="mono-input"
                    />
                  </label>
                  <label className="span-2">
                    Remix project reference
                    <input
                      value={draft.remixRef}
                      onChange={(e) => setField("remixRef", e.target.value)}
                      placeholder="Remix workspace / gist / contract file name"
                      autoComplete="off"
                    />
                    <span className="field-hint">
                      Optional ops note so you can find the source later.
                    </span>
                  </label>
                </div>
              </div>
            )}

            {step === "abi" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 3 — ABI & RPC</h3>
                  <p className="muted">
                    Paste the compiled ABI JSON from Remix and the JSON-RPC URL
                    clients should use. Env fallbacks apply when fields are empty.
                  </p>
                </div>
                <div className="form-grid config-form-grid setup-form">
                  <label className="span-2">
                    RPC URL
                    <input
                      value={draft.rpcUrl}
                      onChange={(e) => setField("rpcUrl", e.target.value)}
                      placeholder="https://…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="field-hint">
                      Prefer a reliable public or private HTTPS endpoint for the
                      selected chain.
                    </span>
                  </label>
                  <label className="span-2">
                    ABI (JSON)
                    <textarea
                      rows={10}
                      value={draft.abi}
                      onChange={(e) => setField("abi", e.target.value)}
                      placeholder='[{ "type": "function", "name": "…", … }]'
                      spellCheck={false}
                      className="mono-input"
                    />
                    <span className="field-hint">
                      {draft.abi.trim()
                        ? abiLooksOk(draft.abi)
                          ? "Valid JSON array."
                          : "Must parse as a JSON array."
                        : "Optional now — required for full client ABI calls."}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {step === "review" && (
              <div className="setup-section">
                <div className="setup-section-head">
                  <h3>Step 4 — Review & save</h3>
                  <p className="muted">
                    Confirm the draft, add notes, then save. Effective values show
                    DB overrides falling back to env.
                  </p>
                </div>

                <dl className="setup-review">
                  <div>
                    <dt>Network</dt>
                    <dd>
                      {draft.networkLabel || "—"}
                      {draft.chainId ? ` · chainId ${draft.chainId}` : ""}
                      {!networkOk && <span className="setup-warn"> Incomplete</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>Contract</dt>
                    <dd>
                      <code className="break-all">
                        {draft.contractAddress || "—"}
                      </code>
                      {!contractOk && draft.contractAddress && (
                        <span className="setup-warn"> Invalid</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>RPC</dt>
                    <dd>
                      <code className="break-all">{draft.rpcUrl || "—"}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>ABI</dt>
                    <dd>
                      {draft.abi.trim()
                        ? abiLooksOk(draft.abi)
                          ? "Valid JSON array"
                          : "Invalid JSON"
                        : "Empty (env may apply)"}
                    </dd>
                  </div>
                  <div>
                    <dt>Admin wallet</dt>
                    <dd>
                      <code className="break-all">
                        {draft.adminWallet || "—"}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Remix ref</dt>
                    <dd>{draft.remixRef || "—"}</dd>
                  </div>
                </dl>

                {effective && (
                  <div className="setup-effective">
                    <p className="engine-eyebrow">Effective (DB → env fallback)</p>
                    <ul className="muted">
                      <li>
                        Address:{" "}
                        <code>{effective.contractAddress || "—"}</code>
                        {effective.configured
                          ? " · configured"
                          : " · not configured"}
                      </li>
                      <li>
                        {effective.networkLabel} · chainId {effective.chainId}
                      </li>
                      <li>
                        RPC: <code>{effective.rpcUrl}</code>
                      </li>
                      <li>
                        Explorer:{" "}
                        <a
                          href={effective.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {effective.explorerUrl}
                        </a>
                      </li>
                    </ul>
                  </div>
                )}

                <div className="form-grid config-form-grid setup-form">
                  <label className="span-2">
                    Notes
                    <textarea
                      rows={3}
                      value={draft.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                      placeholder="Deployment checklist, constructor args, verification status…"
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
