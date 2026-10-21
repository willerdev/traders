"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type MomoP2pWithdrawal, type SavedWithdrawalWallet } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  WalletWithdrawFeeNotice,
  WALLET_WITHDRAWAL_FEE_USD,
  walletWithdrawNetAmount,
  estimateWithdrawalFees,
  type WithdrawalScheduleInfo,
} from "@/components/wallet/wallet-withdraw-fee-notice";
import {
  WalletAddWithdrawalWalletModal,
  maskWithdrawalWalletAddress,
} from "@/components/wallet/wallet-saved-withdrawal-wallets";

function isMomoNetwork(network?: string) {
  return network === "MOMO_MTN" || network === "MOMO_AIRTEL";
}

function formatUgx(n: number) {
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

export function WalletWithdrawModal({
  open,
  onClose,
  availableBalance,
  maxWithdrawUsdt,
  maintenance,
  feeUsdt = WALLET_WITHDRAWAL_FEE_USD,
  schedule,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  availableBalance: number;
  maxWithdrawUsdt?: number;
  maintenance?: {
    maxFraction: number;
    feesWaived: boolean;
    cancelDisabled?: boolean;
    message: string;
  } | null;
  feeUsdt?: number;
  schedule?: WithdrawalScheduleInfo | null;
  onComplete?: () => void;
}) {
  const maintenanceMode = Boolean(maintenance);
  const [step, setStep] = useState<"notice" | "form" | "confirm" | "otp" | "p2p">(
    "form",
  );
  const [noticeAck, setNoticeAck] = useState(false);
  const [noticeSecondsLeft, setNoticeSecondsLeft] = useState(10);
  const [checks, setChecks] = useState([false, false, false]);
  const [destConfirm, setDestConfirm] = useState("");
  const [typeWord, setTypeWord] = useState("");
  const [typeAmount, setTypeAmount] = useState("");
  const [reviewSecondsLeft, setReviewSecondsLeft] = useState(20);
  const [amount, setAmount] = useState("");
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [momoQuote, setMomoQuote] = useState<{
    price: number;
    amountUgx: number;
    amountUsdt: number;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [p2p, setP2p] = useState<MomoP2pWithdrawal | null>(null);
  const [p2pPhase, setP2pPhase] = useState<"initiated" | "under_process">(
    "initiated",
  );
  const [timerSec, setTimerSec] = useState(0);

  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const items = await api.wallet.withdrawalWallets();
      setWallets(items);
      setSelectedWalletId((prev) =>
        prev && items.some((w) => w.id === prev) ? prev : (items[0]?.id ?? ""),
      );
    } catch {
      setWallets([]);
      setSelectedWalletId("");
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setStep("form");
      setAmount("");
      setOtpSessionId("");
      setOtpEmail("");
      setOtpCode("");
      setError("");
      setSuccess(false);
      setMomoQuote(null);
      setP2p(null);
      setP2pPhase("initiated");
      setTimerSec(0);
      setNoticeAck(false);
      setNoticeSecondsLeft(10);
      setChecks([false, false, false]);
      setDestConfirm("");
      setTypeWord("");
      setTypeAmount("");
      setReviewSecondsLeft(20);
      return;
    }
    setStep(maintenance ? "notice" : "form");
    setNoticeSecondsLeft(maintenance ? 10 : 0);
    void loadWallets();
    // maintenance is stable for the lifetime of the open modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadWallets]);

  // Maintenance notice: force a short read before continuing.
  useEffect(() => {
    if (!open || step !== "notice" || noticeSecondsLeft <= 0) return;
    const id = window.setTimeout(
      () => setNoticeSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearTimeout(id);
  }, [open, step, noticeSecondsLeft]);

  // Final review: button unlocks only after the review timer.
  useEffect(() => {
    if (!open || step !== "confirm") return;
    setReviewSecondsLeft(20);
    const id = window.setInterval(
      () => setReviewSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    const stop = window.setTimeout(() => window.clearInterval(id), 21000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [open, step]);

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId);
  const isMomo = isMomoNetwork(selectedWallet?.network);
  const gross = Number(amount);
  const withdrawCap =
    maxWithdrawUsdt != null && Number.isFinite(maxWithdrawUsdt)
      ? Math.min(availableBalance, maxWithdrawUsdt)
      : availableBalance;
  const fee = feeUsdt ?? WALLET_WITHDRAWAL_FEE_USD;
  const preview =
    Number.isFinite(gross) && gross > 0
      ? estimateWithdrawalFees(gross, fee, schedule)
      : null;
  const net = walletWithdrawNetAmount(amount, fee, schedule);

  useEffect(() => {
    if (!open || !isMomo || net == null || net <= 0) {
      setMomoQuote(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setQuoteLoading(true);
      void api.wallet
        .momoP2pQuote(net)
        .then((q) => {
          if (!cancelled) {
            setMomoQuote({
              price: q.price,
              amountUgx: q.amountUgx,
              amountUsdt: q.amountUsdt,
            });
          }
        })
        .catch(() => {
          if (!cancelled) setMomoQuote(null);
        })
        .finally(() => {
          if (!cancelled) setQuoteLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, isMomo, net]);

  useEffect(() => {
    if (step !== "p2p" || p2pPhase !== "initiated") return;
    setTimerSec(0);
    const tick = window.setInterval(() => {
      setTimerSec((s) => s + 1);
    }, 1000);
    const promote = window.setTimeout(() => {
      setP2pPhase("under_process");
    }, 2500);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(promote);
    };
  }, [step, p2pPhase, p2p?.id]);

  useEffect(() => {
    if (step !== "p2p" || !p2p?.id || p2p.status === "COMPLETED") return;
    const poll = window.setInterval(() => {
      void api.wallet
        .momoP2pGet(p2p.id)
        .then((row) => {
          setP2p(row);
          if (row.status === "UNDER_PROCESS" || row.status === "COMPLETED") {
            setP2pPhase(
              row.status === "COMPLETED" ? "under_process" : "under_process",
            );
          }
          if (row.status === "COMPLETED") {
            setSuccess(true);
            onComplete?.();
          }
        })
        .catch(() => {});
    }, 8000);
    return () => window.clearInterval(poll);
  }, [step, p2p?.id, p2p?.status, onComplete]);

  async function requestOtp() {
    setError("");
    if (!selectedWalletId) {
      setError("Select a saved withdrawal destination or add one first");
      return;
    }
    setLoading(true);
    try {
      const res = await api.wallet.requestWithdrawOtp(
        Number(amount),
        selectedWalletId,
      );
      setOtpSessionId(res.sessionId);
      setOtpEmail(res.email);
      setOtpCode("");
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function confirmWithdraw() {
    setError("");
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    try {
      const res = await api.wallet.withdraw(
        Number(amount),
        selectedWalletId,
        otpSessionId,
        otpCode.trim(),
      );
      onComplete?.();
      if (res.status === "momo_p2p" && res.p2p) {
        setP2p(res.p2p);
        setP2pPhase("initiated");
        setStep("p2p");
      } else {
        setSuccess(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  async function confirmArrival() {
    if (!p2p?.id) return;
    setError("");
    setLoading(true);
    try {
      const row = await api.wallet.momoP2pConfirmReceived(p2p.id);
      setP2p(row);
      setSuccess(true);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm arrival");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const minWithdraw =
    preview && preview.totalFeesUsdt > 0
      ? preview.totalFeesUsdt + 0.01
      : fee > 0
        ? fee + 0.01
        : 0.01;
  const canRequestOtp =
    !loading &&
    !walletsLoading &&
    Boolean(selectedWalletId) &&
    Number.isFinite(gross) &&
    gross >= minWithdraw &&
    gross <= withdrawCap;

  const destMatches =
    !maintenanceMode ||
    (Boolean(selectedWallet) &&
      destConfirm.trim() === (selectedWallet?.address ?? "").trim());
  const allChecked = checks.every(Boolean);
  const canContinueForm = canRequestOtp && (!maintenanceMode || (allChecked && destMatches));
  const expectedAmountText = Number.isFinite(gross) && gross > 0 ? gross.toFixed(2) : "";
  const canSendOtp =
    canRequestOtp &&
    reviewSecondsLeft <= 0 &&
    typeWord.trim().toUpperCase() === "WITHDRAW" &&
    typeAmount.trim() === expectedAmountText;

  const stepIndex = maintenanceMode
    ? { notice: 0, form: 1, confirm: 2, otp: 3, p2p: 4 }[step]
    : { notice: 0, form: 0, confirm: 1, otp: 1, p2p: 2 }[step];
  const stepLabels = maintenanceMode
    ? ["Notice", "Details", "Confirm", "Email code"]
    : ["Details", "Email code"];

  return (
    <>
      <div
        className="modal-overlay fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="modal-panel max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-transparent to-emerald-500/10 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                  {maintenanceMode ? "Maintenance withdrawal" : "Wallet"}
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-white">
                  Send / Withdraw
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {!success && step !== "p2p" && (
              <ol className="mt-3 flex items-center gap-1.5">
                {stepLabels.map((label, i) => (
                  <li key={label} className="flex flex-1 items-center gap-1.5 last:flex-none">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                        i <= stepIndex
                          ? "bg-cyan-400 text-[#06202b]"
                          : "bg-white/10 text-gray-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`hidden text-[10px] font-medium min-[420px]:block ${
                        i <= stepIndex ? "text-cyan-100" : "text-gray-500"
                      }`}
                    >
                      {label}
                    </span>
                    {i < stepLabels.length - 1 && (
                      <span className={`h-px flex-1 ${i < stepIndex ? "bg-cyan-400/70" : "bg-white/10"}`} />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-4 p-5">
            {success ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-success" />
                <p className="text-sm text-gray-300">
                  {p2p
                    ? "MoMo withdrawal marked complete. Thank you."
                    : "Withdrawal requested. You will receive an email when processed."}
                </p>
                <Button onClick={onClose}>Done</Button>
              </div>
            ) : step === "p2p" && p2p ? (
              <>
                {p2pPhase === "initiated" ? (
                  <div className="space-y-3 py-2 text-center">
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                    <p className="text-base font-medium text-white">
                      Withdraw initiated
                    </p>
                    <p className="text-sm text-gray-400">
                      Notifying ops to send MoMo… {timerSec}s
                    </p>
                    <p className="text-sm text-gray-300">
                      {formatCurrency(p2p.amountUsdt)} →{" "}
                      {formatUgx(p2p.amountUgx)} to {p2p.momoPhone}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-white">
                      Status: under process
                    </p>
                    <p className="text-sm text-gray-400">
                      We are sending{" "}
                      <strong className="text-white">
                        {formatUgx(p2p.amountUgx)}
                      </strong>{" "}
                      to <strong className="text-white">{p2p.momoPhone}</strong>{" "}
                      ({p2p.momoNetwork}). Rate{" "}
                      {p2p.rateUgxPerUsdt.toFixed(2)} UGX/USDT (Binance P2P).
                    </p>
                    {error && <p className="text-sm text-danger">{error}</p>}
                    <Button
                      className="w-full"
                      onClick={() => void confirmArrival()}
                      disabled={loading}
                    >
                      {loading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Confirm money arrived
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={onClose}>
                      Close — keep waiting
                    </Button>
                  </div>
                )}
              </>
            ) : step === "otp" ? (
              <>
                <p className="text-sm text-gray-400">
                  We emailed a 6-digit code to{" "}
                  <strong className="text-white">{otpEmail || "your email"}</strong>{" "}
                  to confirm withdrawing{" "}
                  <strong className="text-white">{formatCurrency(gross)}</strong>
                  {selectedWallet
                    ? ` to ${selectedWallet.label}`
                    : ""}
                  .
                </p>
                {isMomo && momoQuote && (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300">
                    MoMo P2P: ~{formatUgx(momoQuote.amountUgx)} at{" "}
                    {momoQuote.price.toFixed(2)} UGX/USDT
                  </p>
                )}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">
                    Verification code
                  </label>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  className="w-full"
                  onClick={() => void confirmWithdraw()}
                  disabled={loading || otpCode.trim().length < 6}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isMomo ? "Complete MoMo P2P" : "Confirm withdrawal"}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
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
                    variant="ghost"
                    className="flex-1"
                    disabled={loading}
                    onClick={() => void requestOtp()}
                  >
                    Resend code
                  </Button>
                </div>
              </>
            ) : step === "notice" ? (
              <>
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <p className="flex items-center gap-2 font-semibold text-amber-100">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Please read — maintenance withdrawals
                  </p>
                  <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-amber-50/85">
                    <li>
                      Withdrawals are temporarily limited
                      {maintenance?.maxFraction != null
                        ? ` to ${Math.round(maintenance.maxFraction * 100)}% of your available balance`
                        : ""}
                      .
                    </li>
                    <li>Every request is manually reviewed — processing takes longer than usual.</li>
                    <li>Cancelling a pending withdrawal is temporarily disabled.</li>
                    {maintenance?.feesWaived && <li>Withdrawal fees are waived during maintenance.</li>}
                  </ul>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={noticeAck}
                    onChange={(e) => setNoticeAck(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
                  />
                  I understand withdrawals are limited during maintenance and may take longer to process.
                </label>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  className="w-full"
                  disabled={!noticeAck || noticeSecondsLeft > 0}
                  onClick={() => setStep("form")}
                >
                  {noticeSecondsLeft > 0 ? (
                    <>
                      <Clock3 className="mr-2 h-4 w-4" />
                      Please read… {noticeSecondsLeft}s
                    </>
                  ) : (
                    <>
                      Continue
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
                <Button variant="ghost" className="w-full" onClick={onClose}>
                  Not now
                </Button>
              </>
            ) : step === "confirm" ? (
              <>
                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-white">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Review carefully
                  </p>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">You send</span>
                    <strong className="text-white">{formatCurrency(gross)}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">You receive</span>
                    <strong className="text-emerald-300">
                      {net != null ? formatCurrency(net) : "—"}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500">To</span>
                    <span className="min-w-0 text-right">
                      <span className="block text-gray-200">{selectedWallet?.label}</span>
                      <span className="block truncate font-mono text-[11px] text-gray-500">
                        {selectedWallet?.address}
                      </span>
                    </span>
                  </div>
                  <p className="border-t border-white/5 pt-2 text-xs leading-relaxed text-amber-200/90">
                    This cannot be cancelled once submitted during maintenance.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">
                    Type the amount exactly (e.g. {expectedAmountText || "100.00"})
                  </label>
                  <Input
                    inputMode="decimal"
                    placeholder={expectedAmountText || "0.00"}
                    value={typeAmount}
                    onChange={(e) => setTypeAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">
                    Type WITHDRAW to confirm
                  </label>
                  <Input
                    autoComplete="off"
                    placeholder="WITHDRAW"
                    value={typeWord}
                    onChange={(e) => setTypeWord(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  className="w-full"
                  onClick={() => void requestOtp()}
                  disabled={!canSendOtp}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  {reviewSecondsLeft > 0
                    ? `Review your details… ${reviewSecondsLeft}s`
                    : "Send email code"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={loading}
                  onClick={() => {
                    setStep("form");
                    setError("");
                  }}
                >
                  Back — edit details
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  Available:{" "}
                  <strong className="text-white">
                    {formatCurrency(availableBalance)}
                  </strong>
                  {withdrawCap < availableBalance ? (
                    <>
                      {" "}
                      · max now{" "}
                      <strong className="text-amber-200">
                        {formatCurrency(withdrawCap)}
                      </strong>
                    </>
                  ) : null}
                </p>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">
                    Amount (USDT)
                  </label>
                  <Input
                    type="number"
                    max={withdrawCap}
                    min={minWithdraw}
                    step={0.01}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <WalletWithdrawFeeNotice
                    amount={amount}
                    feeUsdt={fee}
                    schedule={schedule}
                    maxWithdrawUsdt={maxWithdrawUsdt}
                    maintenance={maintenance}
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs text-gray-400">
                      Withdraw to
                    </label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setAddWalletOpen(true)}
                    >
                      Add wallet / MoMo
                    </button>
                  </div>
                  {walletsLoading ? (
                    <p className="text-sm text-gray-400">Loading saved wallets…</p>
                  ) : wallets.length === 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Add a verified TRC20 or MoMo destination before withdrawing.
                    </div>
                  ) : (
                    <select
                      value={selectedWalletId}
                      onChange={(e) => setSelectedWalletId(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    >
                      {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.label} · {wallet.network} ·{" "}
                          {maskWithdrawalWalletAddress(wallet.address)}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedWallet && (
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      {selectedWallet.address}
                    </p>
                  )}
                  {maintenanceMode && selectedWallet && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs text-amber-200/90">
                        Re-type your destination exactly to confirm it is yours
                      </label>
                      <Input
                        autoComplete="off"
                        placeholder={isMomo ? "Re-type MoMo number" : "Paste your TRC20 address again"}
                        value={destConfirm}
                        onChange={(e) => setDestConfirm(e.target.value)}
                      />
                      {destConfirm.trim() && !destMatches && (
                        <p className="mt-1 text-xs text-danger">
                          Does not match the selected destination above.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {maintenanceMode && (
                  <fieldset className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                    <legend className="px-1 text-xs font-semibold text-gray-300">
                      Confirm all three
                    </legend>
                    {[
                      isMomo
                        ? "This MoMo number is mine and can receive money."
                        : "This is my own wallet address on the correct network (TRC20).",
                      "I understand this withdrawal is manually reviewed during maintenance.",
                      "I understand it cannot be cancelled once submitted.",
                    ].map((label, i) => (
                      <label
                        key={label}
                        className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-300"
                      >
                        <input
                          type="checkbox"
                          checked={checks[i]}
                          onChange={(e) =>
                            setChecks((prev) =>
                              prev.map((v, j) => (j === i ? e.target.checked : v)),
                            )
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                )}
                {isMomo && (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-50">
                    {quoteLoading ? (
                      "Fetching Binance P2P UGX rate…"
                    ) : momoQuote ? (
                      <>
                        MoMo P2P: you receive ~{formatUgx(momoQuote.amountUgx)}{" "}
                        at {momoQuote.price.toFixed(2)} UGX per USDT (Binance
                        C2C). Ops will send MoMo after you complete.
                      </>
                    ) : (
                      "Select an amount to preview the MoMo UGX rate."
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  We&apos;ll email a one-time code to confirm this withdrawal.
                </p>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  className="w-full"
                  onClick={() =>
                    maintenanceMode ? setStep("confirm") : void requestOtp()
                  }
                  disabled={!canContinueForm}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {net != null
                    ? `Continue — ${formatCurrency(net)}`
                    : amount
                      ? `Continue — ${formatCurrency(gross)}`
                      : "Continue"}
                </Button>
                {maintenanceMode && !canContinueForm && canRequestOtp && (
                  <p className="-mt-2 text-center text-xs text-gray-500">
                    Complete the checklist and re-type your destination to continue.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <WalletAddWithdrawalWalletModal
        open={addWalletOpen}
        onClose={() => setAddWalletOpen(false)}
        onSaved={() => void loadWallets()}
      />
    </>
  );
}
