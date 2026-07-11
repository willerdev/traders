"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { syncApiAuthToken } from "@/stores/auth";
import { cn, formatCurrency } from "@/lib/utils";
import { formatEvaluationSize } from "@/lib/evaluation-plans";
import {
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
} from "lucide-react";
import {
  PaymentSourceSelector,
  type PaymentSource,
} from "@/components/wallet/payment-source-selector";
import {
  MomoPaymentFields,
  type FlutterwavePublicConfig,
} from "@/components/payments/momo-payment-fields";

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

export function EvaluationCheckoutPanel({
  planId,
  evaluationType,
  variant,
  evaluationSize,
  feeUsdt,
  onComplete,
  onClose,
}: {
  planId: string;
  evaluationType: string;
  variant: string;
  evaluationSize: number;
  feeUsdt: number;
  onComplete?: () => void;
  onClose: () => void;
}) {
  const [network, setNetwork] = useState("TRC20");
  const [source, setSource] = useState<PaymentSource>("crypto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payAddress, setPayAddress] = useState("");
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress>("waiting");
  const [copied, setCopied] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [flwConfig, setFlwConfig] = useState<FlutterwavePublicConfig | null>(null);
  const [momoPhone, setMomoPhone] = useState("");
  const [momoNetwork, setMomoNetwork] = useState("MTN");
  const [momoInstruction, setMomoInstruction] = useState("");

  useEffect(() => {
    void api.flutterwave.config().then(setFlwConfig);
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!syncApiAuthToken()) return;
    try {
      const s = await api.wallet.summary();
      setWalletBalance(Number(s.availableBalance ?? 0));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  useEffect(() => {
    if (!paymentId || progress === "complete") return;
    const timer = setInterval(async () => {
      try {
        const status = await api.payments.getStatus(paymentId);
        setProgress(status.progress as Progress);
        if (status.confirmed) {
          setProgress("complete");
          onComplete?.();
        }
      } catch {
        /* retry */
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [paymentId, progress, onComplete]);

  const startCheckout = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.evaluations.checkout({
        type: evaluationType,
        variant,
        planId,
        network,
        source,
        ...(source === "momo"
          ? {
              momoPhone,
              momoNetwork,
              momoCountryCode: flwConfig?.countryCode,
            }
          : {}),
      });
      if (result.success) {
        setProgress("complete");
        onComplete?.();
        return;
      }
      if (result.paymentId) {
        setPaymentId(result.paymentId);
        if (source === "momo") {
          setMomoInstruction(
            (result as { instruction?: string }).instruction ?? "",
          );
        } else {
          setPayAddress(result.payAddress ?? "");
          setPayAmount(result.payAmount ?? feeUsdt);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <Card
        className="modal-panel w-full max-w-lg border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Start evaluation</h3>
              <p className="text-sm text-gray-400">
                {formatEvaluationSize(evaluationSize)} program ·{" "}
                {formatCurrency(feeUsdt)} fee
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          {progress === "complete" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium">Evaluation activated</p>
              <p className="text-sm text-gray-400">
                Open MT5 to trade within your program limits.
              </p>
              <Button onClick={onComplete ?? onClose}>Go to dashboard</Button>
            </div>
          ) : !paymentId ? (
            <>
              <PaymentSourceSelector
                source={source}
                onSourceChange={setSource}
                walletBalance={walletBalance}
                amountDue={feeUsdt}
                momoEnabled={Boolean(flwConfig?.enabled)}
              />
              {source === "momo" && flwConfig?.enabled ? (
                <MomoPaymentFields
                  phone={momoPhone}
                  onPhoneChange={setMomoPhone}
                  network={momoNetwork}
                  onNetworkChange={setMomoNetwork}
                  config={flwConfig}
                />
              ) : null}
              {source === "crypto" ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {NETWORKS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setNetwork(item.id)}
                      className={cn(
                        "rounded-xl border p-3 text-left text-sm transition-colors",
                        network === item.id
                          ? "border-primary bg-primary/10"
                          : "border-white/10 hover:border-white/20",
                      )}
                    >
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.hint}</p>
                    </button>
                  ))}
                </div>
              ) : null}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button className="w-full" onClick={startCheckout} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  `Pay ${formatCurrency(feeUsdt)}`
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <p className="text-sm text-gray-400">{PROGRESS_LABEL[progress]}</p>
                {source === "momo" ? (
                  <p className="mt-3 text-sm text-gray-300">
                    {momoInstruction ||
                      "Approve the Mobile Money prompt on your phone to complete enrollment."}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-bold">
                      {payAmount != null ? payAmount.toFixed(2) : feeUsdt.toFixed(2)} USDT
                    </p>
                    {payAddress ? (
                      <>
                        <div className="mx-auto mt-4 flex h-36 w-36 items-center justify-center rounded-xl bg-white">
                          <QrCode className="h-16 w-16 text-slate-400" />
                        </div>
                        <p className="mt-3 break-all font-mono text-xs text-gray-300">
                          {payAddress}
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-2"
                          onClick={async () => {
                            await navigator.clipboard.writeText(payAddress);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="mr-1 h-4 w-4" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 h-4 w-4" /> Copy address
                            </>
                          )}
                        </Button>
                      </>
                    ) : null}
                  </>
                )}
              </div>
              <Button variant="secondary" className="w-full" onClick={() => void startCheckout()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh status
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
