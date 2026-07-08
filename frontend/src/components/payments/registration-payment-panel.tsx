"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { syncApiAuthToken } from "@/stores/auth";
import { cn, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  Tag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  PaymentSourceSelector,
  type PaymentSource,
} from "@/components/wallet/payment-source-selector";

const NETWORKS = [
  { id: "TRC20", label: "TRC20 (Tron)", hint: "Lowest fees" },
  { id: "BEP20", label: "BEP20 (BSC)", hint: "Fast" },
  { id: "ERC20", label: "ERC20 (ETH)", hint: "Higher gas" },
] as const;

type Progress = "waiting" | "confirming" | "partial" | "complete" | "failed" | "expired";

const PROGRESS_LABEL: Record<Progress, string> = {
  waiting: "Waiting for your transfer",
  confirming: "Payment detected — confirming on chain",
  partial: "Partial payment received",
  complete: "Payment confirmed",
  failed: "Payment failed",
  expired: "Payment expired",
};

export function RegistrationPaymentPanel({
  onComplete,
  renewal = false,
}: {
  onComplete?: () => void;
  renewal?: boolean;
}) {
  const [network, setNetwork] = useState<string>("TRC20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    originalAmount: number;
    finalAmount: number;
  } | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payAddress, setPayAddress] = useState("");
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [payCurrency, setPayCurrency] = useState("");
  const [progress, setProgress] = useState<Progress>("waiting");
  const [actuallyPaid, setActuallyPaid] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState<PaymentSource>("crypto");
  const [walletBalance, setWalletBalance] = useState(0);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const [feeUsdt, setFeeUsdt] = useState(5);

  const amountDue = appliedPromo?.finalAmount ?? feeUsdt;

  const refreshWallet = useCallback(async () => {
    if (!syncApiAuthToken()) return;
    setWalletRefreshing(true);
    try {
      const s = await api.wallet.summary();
      setWalletBalance(s.availableBalance);
      setLockedBalance(s.lockedBalance);
      setPendingDeposits(s.pendingWalletDeposits ?? 0);
      if (s.availableBalance >= amountDue) {
        setSource((prev) => (prev === "crypto" ? "wallet" : prev));
      }
    } catch {
      /* keep last known balance */
    } finally {
      setWalletRefreshing(false);
    }
  }, [amountDue]);

  useEffect(() => {
    void refreshWallet();
    void api.payments.featuredPromo().then((r) => {
      if (r.registrationFeeUsdt) setFeeUsdt(r.registrationFeeUsdt);
    });
  }, [refreshWallet]);

  useEffect(() => {
    if (!paymentId) return;
    const id = setInterval(() => void refreshWallet(), 12_000);
    return () => clearInterval(id);
  }, [paymentId, refreshWallet]);

  useEffect(() => {
    let cancelled = false;

    async function restorePendingRegistration() {
      try {
        const res = await api.payments.pendingRegistration();
        if (cancelled || !res.pending?.payAddress || !res.pending.paymentId) {
          return;
        }
        setSource("crypto");
        setPaymentId(res.pending.paymentId);
        setPayAddress(res.pending.payAddress);
        setPayAmount(res.pending.payAmount ?? res.pending.amount ?? null);
        setPayCurrency(res.pending.payCurrency || "usdt");
        if (res.pending.network) setNetwork(res.pending.network);
        setProgress("waiting");
      } catch {
        /* no pending renewal payment */
      }
    }

    void restorePendingRegistration();
    return () => {
      cancelled = true;
    };
  }, []);

  const pollStatus = useCallback(async () => {
    if (!paymentId) return;
    try {
      const status = await api.payments.getStatus(paymentId);
      setProgress((status.progress as Progress) || "waiting");
      if (status.actuallyPaid != null) setActuallyPaid(status.actuallyPaid);
      if (status.payAddress) setPayAddress(status.payAddress);
      if (status.payAmount != null) setPayAmount(status.payAmount);
      if (status.confirmed) {
        onComplete?.();
      }
    } catch {
      /* keep polling */
    }
  }, [paymentId, onComplete]);

  useEffect(() => {
    if (source !== "crypto") return;
    let cancelled = false;
    void api.payments.pendingRegistration(network).then((res) => {
      if (cancelled || !res.pending?.payAddress || !res.pending.paymentId) return;
      setPaymentId(res.pending.paymentId);
      setPayAddress(res.pending.payAddress);
      setPayAmount(res.pending.payAmount ?? res.pending.amount ?? null);
      setPayCurrency(res.pending.payCurrency || "usdt");
      setProgress("waiting");
    });
    return () => {
      cancelled = true;
    };
  }, [network, source]);

  useEffect(() => {
    if (!paymentId || progress === "complete") return;
    const id = setInterval(pollStatus, 8000);
    pollStatus();
    return () => clearInterval(id);
  }, [paymentId, progress, pollStatus]);

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setPromoLoading(true);
    setPromoError("");
    try {
      const result = await api.payments.validatePromo(code);
      setAppliedPromo({
        code: result.code,
        discountPercent: result.discountPercent,
        originalAmount: result.originalAmount,
        finalAmount: result.finalAmount,
      });
    } catch (err) {
      setAppliedPromo(null);
      setPromoError(err instanceof Error ? err.message : "Invalid promo code");
    } finally {
      setPromoLoading(false);
    }
  }

  async function startPayment() {
    setLoading(true);
    setError("");
    try {
      if (source === "wallet") {
        await refreshWallet();
      }
      const result = await api.payments.createRegistration(
        network,
        appliedPromo?.code,
        source,
      );
      if (result.success || result.message?.includes("waived")) {
        if (result.balanceAfter != null) {
          setWalletBalance(result.balanceAfter);
        }
        onComplete?.();
        return;
      }
      if (result.message?.includes("still active")) {
        setError("Your weekly access is still active.");
        return;
      }
      if (source === "wallet") {
        throw new Error(result.message || "Wallet payment failed");
      }
      if (!result.payAddress || !result.paymentId) {
        throw new Error(result.message || "Could not create payment");
      }
      setPaymentId(result.paymentId);
      setPayAddress(result.payAddress);
      setPayAmount(result.payAmount ?? result.amount ?? null);
      setPayCurrency(result.payCurrency || "usdt");
      setProgress("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
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

  if (!paymentId) {
    return (
      <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-foreground/[0.02] p-4">
        <p className="text-sm text-muted">
          Pay{" "}
          {appliedPromo ? (
            <>
              <strong className="text-success">
                {appliedPromo.finalAmount} USDT
              </strong>{" "}
              <span className="line-through opacity-60">
                {appliedPromo.originalAmount} USDT
              </span>
            </>
          ) : (
            <strong className="text-foreground">{feeUsdt} USDT</strong>
          )}{" "}
          for <strong className="text-foreground">7 days</strong> of trading
          {renewal ? " (renewal)" : ""}.
        </p>

        <PaymentSourceSelector
          walletBalance={walletBalance}
          lockedBalance={lockedBalance}
          pendingDeposits={pendingDeposits}
          amountDue={amountDue}
          source={source}
          onRefreshWallet={() => void refreshWallet()}
          refreshingWallet={walletRefreshing}
          onSourceChange={(s) => {
            setSource(s);
            setPaymentId(null);
            setError("");
          }}
        />

        <div className="space-y-1">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Promo code (optional)"
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value);
                setPromoError("");
              }}
              className="uppercase sm:max-w-[220px]"
              autoComplete="off"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1"
              disabled={promoLoading || !promoInput.trim()}
              onClick={() => void applyPromo()}
            >
              {promoLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Tag className="h-3.5 w-3.5" />
              )}
              Apply
            </Button>
          </div>
          {promoError && <p className="text-sm text-danger">{promoError}</p>}
          {appliedPromo && (
            <p className="text-sm text-success">
              Code &quot;{appliedPromo.code}&quot; applied —{" "}
              {appliedPromo.discountPercent}% off, you pay{" "}
              {appliedPromo.finalAmount} USDT.
            </p>
          )}
        </div>
        {source === "crypto" && (
          <div className="grid gap-2 sm:grid-cols-3">
            {NETWORKS.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setNetwork(n.id)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  network === n.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-[var(--color-border)] text-muted hover:border-primary/40",
                )}
              >
                <span className="font-medium">{n.label}</span>
                <span className="mt-0.5 block text-xs opacity-70">{n.hint}</span>
              </button>
            ))}
          </div>
        )}
        {source === "wallet" && walletBalance < amountDue && (
          <p className="text-sm text-muted">
            <Link href="/wallet" className="text-primary hover:underline">
              Deposit to your wallet
            </Link>{" "}
            or switch to crypto payment.
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={startPayment} disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {source === "wallet" ? "Processing…" : "Creating payment…"}
            </>
          ) : source === "wallet" ? (
            `Pay ${formatCurrency(amountDue)} from wallet`
          ) : (
            "Generate payment address"
          )}
        </Button>
      </div>
    );
  }

  const qrUrl = payAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payAddress)}`
    : null;

  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          variant={
            progress === "complete"
              ? "success"
              : progress === "failed" || progress === "expired"
                ? "danger"
                : "gold"
          }
        >
          {PROGRESS_LABEL[progress]}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          onClick={pollStatus}
          className="gap-1 text-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {progress === "complete" ? (
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-medium">
            Registration complete — your virtual account is active.
          </span>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            {qrUrl && (
              <div className="mx-auto rounded-lg bg-white p-2 sm:mx-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt="Payment QR code"
                  width={180}
                  height={180}
                  className="rounded"
                />
              </div>
            )}
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  Send exactly
                </p>
                <p className="text-xl font-bold text-foreground">
                  {payAmount ?? "—"} {payCurrency.toUpperCase()}
                </p>
                <p className="text-xs text-muted">Network: {network}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  To address
                </p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {payAddress}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 gap-1"
                  onClick={copyAddress}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied!" : "Copy address"}
                </Button>
              </div>
              {actuallyPaid != null && actuallyPaid > 0 && (
                <p className="text-xs text-muted">
                  Received: {actuallyPaid} {payCurrency.toUpperCase()}
                </p>
              )}
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted">
            <QrCode className="mt-0.5 h-4 w-4 shrink-0" />
            Stay on this page — we check every 8 seconds and activate your
            account when the payment confirms.
          </p>
        </>
      )}
    </div>
  );
}
