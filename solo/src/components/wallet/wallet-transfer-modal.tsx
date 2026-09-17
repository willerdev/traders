"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, Loader2, X } from "lucide-react";

export function WalletTransferModal({
  open,
  onClose,
  availableBalance,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("form");
      setRecipientEmail("");
      setAmount("");
      setOtpSessionId("");
      setOtpEmail("");
      setOtpCode("");
      setRecipientName("");
      setError("");
      setSuccess(false);
      setLoading(false);
    }
  }, [open]);

  const gross = Number(amount);
  const canRequestOtp =
    !loading &&
    recipientEmail.trim().includes("@") &&
    Number.isFinite(gross) &&
    gross > 0 &&
    gross <= availableBalance;

  async function requestOtp() {
    setError("");
    if (!canRequestOtp) {
      setError("Enter a valid recipient email and amount");
      return;
    }
    setLoading(true);
    try {
      const res = await api.wallet.requestTransferOtp(
        recipientEmail.trim(),
        gross,
      );
      setOtpSessionId(res.sessionId);
      setOtpEmail(res.email);
      setRecipientName(res.recipientName);
      setRecipientEmail(res.recipientEmail);
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function confirmTransfer() {
    setError("");
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    try {
      await api.wallet.confirmTransfer(otpSessionId, otpCode.trim());
      setSuccess(true);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="modal-panel w-full max-w-md rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Transfer</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <p className="text-base font-medium text-white">
                Transfer sent
              </p>
              <p className="text-sm text-slate-400">
                {formatCurrency(gross)} USDT to{" "}
                {recipientName || recipientEmail}
              </p>
              <Button type="button" onClick={onClose} className="mt-2 w-full">
                Done
              </Button>
            </div>
          ) : step === "form" ? (
            <>
              <p className="text-sm text-slate-400">
                Send USDT from your platform wallet to another trader by email.
                No fee. You will confirm with a code sent to your email.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Recipient email
                </label>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="trader@email.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Amount (USDT)
                </label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Available {formatCurrency(availableBalance)} USDT
                </p>
              </div>
              {error && (
                <p className="text-sm text-rose-400" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={!canRequestOtp}
                onClick={() => void requestOtp()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Email me a code"
                )}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                We emailed a 6-digit code to{" "}
                <span className="text-white">{otpEmail}</span> to send{" "}
                <span className="text-white">{formatCurrency(gross)} USDT</span>{" "}
                to{" "}
                <span className="text-white">
                  {recipientName} ({recipientEmail})
                </span>
                .
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Verification code
                </label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </div>
              {error && (
                <p className="text-sm text-rose-400" role="alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => {
                    setStep("form");
                    setOtpCode("");
                    setError("");
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={loading || otpCode.trim().length < 6}
                  onClick={() => void confirmTransfer()}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Confirm transfer"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
