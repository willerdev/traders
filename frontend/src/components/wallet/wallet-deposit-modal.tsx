"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import {
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Smartphone,
  X,
} from "lucide-react";
import {
  formatLocalAmount,
  MomoPaymentFields,
  type FlutterwavePublicConfig,
} from "@/components/payments/momo-payment-fields";

const NETWORKS = [
  { id: "TRC20", label: "TRC20", hint: "Lowest fees" },
  { id: "BEP20", label: "BEP20", hint: "Fast" },
  { id: "ERC20", label: "ERC20", hint: "Higher gas" },
] as const;

type Step = "amount" | "network" | "pay" | "confirming" | "done";
type DepositMethod = "crypto" | "momo";
type Progress = "waiting" | "confirming" | "partial" | "complete" | "failed";

const PROGRESS_LABEL: Record<Progress, string> = {
  waiting: "Waiting for transfer",
  confirming: "Confirming on chain",
  partial: "Partial payment received",
  complete: "Deposit confirmed",
  failed: "Payment failed",
};

const DEPOSIT_POLL_COOLDOWN_SEC = 120;

export function WalletDepositModal({
  open,
  onClose,
  minPlanDeposit,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  minPlanDeposit: number;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("2");
  const [startPlan, setStartPlan] = useState(false);
  const [riskPercent, setRiskPercent] = useState("2");
  const [network, setNetwork] = useState("TRC20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payAddress, setPayAddress] = useState("");
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress>("waiting");
  const [copied, setCopied] = useState(false);
  const [depositMin, setDepositMin] = useState(10);
  const [depositMethod, setDepositMethod] = useState<DepositMethod>("crypto");
  const [flwConfig, setFlwConfig] = useState<FlutterwavePublicConfig | null>(null);
  const [momoPhone, setMomoPhone] = useState("");
  const [momoNetwork, setMomoNetwork] = useState("MTN");
  const [momoInstruction, setMomoInstruction] = useState("");
  const [payStartedAt, setPayStartedAt] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(DEPOSIT_POLL_COOLDOWN_SEC);

  const belowMinMessage = (net: string) =>
    `Amount is below the minimum for ${net}. Try a higher amount or switch network.`;

  const reset = useCallback(() => {
    setStep("amount");
    setAmount("10");
    setStartPlan(false);
    setRiskPercent("2");
    setNetwork("TRC20");
    setLoading(false);
    setError("");
    setPaymentId(null);
    setPayAddress("");
    setPayAmount(null);
    setProgress("waiting");
    setPayStartedAt(null);
    setCooldownLeft(DEPOSIT_POLL_COOLDOWN_SEC);
    setDepositMethod("crypto");
    setMomoPhone("");
    setMomoNetwork("MTN");
    setMomoInstruction("");
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.flutterwave.config().then((cfg) => {
      if (!cancelled) setFlwConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || depositMethod !== "crypto") return;
    let cancelled = false;
    void api.wallet.depositMinimum(network).then((m) => {
      if (cancelled) return;
      setDepositMin(m.minUsdt);
      setAmount((prev) => {
        const n = Number(prev);
        return !Number.isFinite(n) || n < m.minUsdt ? String(m.minUsdt) : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, network, depositMethod]);

  useEffect(() => {
    if (!open || depositMethod !== "momo" || !flwConfig?.enabled) return;
    setDepositMin(Math.max(flwConfig.minDepositUsd, minPlanDeposit > 0 ? 0 : 0, flwConfig.minDepositUsd));
  }, [open, depositMethod, flwConfig, minPlanDeposit]);

  const pollStatus = useCallback(async () => {
    if (!paymentId) return;
    try {
      const status = await api.payments.getStatus(paymentId);
      if (status.payAddress) setPayAddress(status.payAddress);
      if (status.payAmount != null) setPayAmount(status.payAmount);
      const p = (status.progress as Progress) || "waiting";
      setProgress(p);
      if (status.confirmed) {
        setStep("done");
        onComplete?.();
      }
    } catch {
      /* polling */
    }
  }, [paymentId, onComplete]);

  useEffect(() => {
    if (!paymentId || step === "done" || payStartedAt == null) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - payStartedAt) / 1000);
      setCooldownLeft(Math.max(0, DEPOSIT_POLL_COOLDOWN_SEC - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [paymentId, step, payStartedAt]);

  useEffect(() => {
    if (!paymentId || step === "done") return;
    const t = setInterval(() => void pollStatus(), 8000);
    void pollStatus();
    return () => clearInterval(t);
  }, [paymentId, step, pollStatus]);

  const canManualRefresh = cooldownLeft <= 0;
  const cooldownLabel = `${String(Math.floor(cooldownLeft / 60)).padStart(1, "0")}:${String(cooldownLeft % 60).padStart(2, "0")}`;

  async function createPayment() {
    setError("");
    setLoading(true);
    try {
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount < depositMin) {
        throw new Error(belowMinMessage(network));
      }
      if (startPlan && numAmount < minPlanDeposit) {
        throw new Error(
          `Earning plan requires at least ${formatCurrency(minPlanDeposit)} USDT`,
        );
      }
      const res = await api.wallet.deposit(
        depositMethod === "momo"
          ? {
              method: "momo",
              amount: numAmount,
              momoPhone,
              momoNetwork,
              momoCountryCode: flwConfig?.countryCode,
              ...(startPlan ? { riskPercent: Number(riskPercent) } : {}),
            }
          : {
              network,
              amount: numAmount,
              ...(startPlan ? { riskPercent: Number(riskPercent) } : {}),
            },
      );
      setPaymentId(res.paymentId);
      setPayAddress(res.payAddress ?? "");
      setPayAmount(res.payAmount ?? res.amount);
      setMomoInstruction(res.instruction ?? "");
      setStep("pay");
      setProgress("waiting");
      setPayStartedAt(Date.now());
      setCooldownLeft(DEPOSIT_POLL_COOLDOWN_SEC);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start deposit");
    } finally {
      setLoading(false);
    }
  }

  async function copyAddress() {
    if (!payAddress) return;
    await navigator.clipboard.writeText(payAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  const steps: { id: Step; label: string }[] = [
    { id: "amount", label: "Amount" },
    { id: "network", label: "Network" },
    { id: "pay", label: "Pay" },
    { id: "confirming", label: "Confirm" },
    { id: "done", label: "Done" },
  ];

  const stepIndex = steps.findIndex((s) =>
    step === "confirming" ? s.id === "pay" : s.id === step,
  );

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-lg rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            {depositMethod === "momo" ? "Deposit via MoMo" : "Deposit USDT"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-1">
            {steps.slice(0, 4).map((s, i) => (
              <div key={s.id} className="flex flex-1 items-center gap-1">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    i <= stepIndex
                      ? "bg-primary text-white"
                      : "bg-white/10 text-gray-500",
                  )}
                >
                  {i < stepIndex || step === "done" ? "✓" : i + 1}
                </div>
                {i < 3 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 rounded",
                      i < stepIndex ? "bg-primary" : "bg-white/10",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {step === "done"
              ? "Deposit complete"
              : step === "pay"
                ? "Send crypto to the address below"
                : step === "network"
                  ? "Choose your network"
                  : "Enter any amount to add to your wallet"}
          </p>
        </div>

        <div className="space-y-4 p-5">
          {step === "amount" && (
            <>
              {flwConfig?.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositMethod("crypto")}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium",
                      depositMethod === "crypto"
                        ? "border-primary bg-primary/10 text-white"
                        : "border-white/10 text-gray-400",
                    )}
                  >
                    USDT crypto
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositMethod("momo")}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5",
                      depositMethod === "momo"
                        ? "border-emerald-500 bg-emerald-500/10 text-white"
                        : "border-white/10 text-gray-400",
                    )}
                  >
                    <Smartphone className="h-4 w-4" />
                    MoMo
                  </button>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Amount (USDT) — minimum {formatCurrency(depositMin)}
                  {depositMethod === "crypto" ? ` on ${network}` : ""}
                </label>
                <Input
                  type="number"
                  min={depositMin}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-lg font-semibold"
                />
                {depositMethod === "momo" && flwConfig?.enabled && (
                  <p className="mt-1 text-xs text-emerald-400/90">
                    ≈ {formatLocalAmount(Number(amount) || 0, flwConfig.usdRate, flwConfig.currency)} charged on your phone
                  </p>
                )}
              </div>
              {depositMethod === "momo" && flwConfig?.enabled && (
                <MomoPaymentFields
                  phone={momoPhone}
                  onPhoneChange={setMomoPhone}
                  network={momoNetwork}
                  onNetworkChange={setMomoNetwork}
                  config={flwConfig}
                />
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 p-3">
                <input
                  type="checkbox"
                  checked={startPlan}
                  onChange={(e) => setStartPlan(e.target.checked)}
                  className="rounded border-white/20"
                />
                <div>
                  <p className="text-sm text-white">Start 5-day earning plan</p>
                  <p className="text-xs text-gray-500">
                    Min {formatCurrency(minPlanDeposit)} · 1:2 RR · daily yield
                  </p>
                </div>
              </label>
              {startPlan && (
                <div>
                  <label className="mb-1 block text-xs text-gray-400">
                    Risk % (1:2 RR)
                  </label>
                  <Input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(e.target.value)}
                  />
                </div>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                className="w-full"
                onClick={() =>
                  depositMethod === "momo"
                    ? void createPayment()
                    : setStep("network")
                }
                disabled={
                  !amount ||
                  Number(amount) < depositMin ||
                  loading ||
                  (depositMethod === "momo" && momoPhone.length < 8)
                }
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {depositMethod === "momo" ? "Send MoMo prompt" : "Continue"}
              </Button>
            </>
          )}

          {step === "network" && depositMethod === "crypto" && (
            <>
              <div className="grid gap-2">
                {NETWORKS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setNetwork(n.id)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition-colors",
                      network === n.id
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-primary/40",
                    )}
                  >
                    <span className="font-medium text-white">{n.label}</span>
                    <span className="ml-2 text-xs text-gray-500">{n.hint}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep("amount")}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => void createPayment()}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate address
                </Button>
              </div>
            </>
          )}

          {(step === "pay" || step === "done") && (
            <>
              {step === "done" ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-success" />
                  <p className="text-sm font-medium text-white">
                    Deposit confirmed — balance updated
                  </p>
                  <Button onClick={onClose}>Done</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="gold">{PROGRESS_LABEL[progress]}</Badge>
                    {canManualRefresh ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void pollStatus()}
                        className="gap-1 text-muted"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">
                        Refresh in {cooldownLabel}
                      </span>
                    )}
                  </div>
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Confirmation check
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-white">
                      {canManualRefresh ? "Ready" : cooldownLabel}
                    </p>
                    {!canManualRefresh && (
                      <div className="mx-auto mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-primary transition-all duration-1000"
                          style={{
                            width: `${((DEPOSIT_POLL_COOLDOWN_SEC - cooldownLeft) / DEPOSIT_POLL_COOLDOWN_SEC) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    {depositMethod === "momo" ? (
                      <>
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Approve on your phone
                        </p>
                        <p className="mt-2 text-sm text-white">
                          {momoInstruction ||
                            "Check your phone for the Mobile Money prompt and enter your PIN to approve."}
                        </p>
                        <p className="mt-3 text-xs text-muted">
                          {formatCurrency(Number(amount))} USDT
                          {flwConfig?.enabled &&
                            ` (≈ ${formatLocalAmount(Number(amount), flwConfig.usdRate, flwConfig.currency)})`}
                        </p>
                        <p className="text-xs text-muted">
                          {momoNetwork} · +{flwConfig?.countryCode ?? "256"}
                          {momoPhone}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs uppercase tracking-wide text-muted">
                          Send exactly
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {payAmount ?? amount} USDT
                        </p>
                        <p className="text-xs text-muted">Network: {network}</p>
                        <p className="mt-3 break-all font-mono text-xs text-primary">
                          {payAddress}
                        </p>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2 gap-1"
                          onClick={() => void copyAddress()}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copied ? "Copied!" : "Copy address"}
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    We check automatically every 8 seconds. Manual refresh unlocks
                    after the 2-minute countdown — no need to keep tapping refresh.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
