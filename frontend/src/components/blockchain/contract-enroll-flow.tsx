"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  FileText,
  LockKeyhole,
  Loader2,
  ScanLine,
  ShieldCheck,
  Wallet,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  api,
  type ChainContractEnrollment,
  type ChainVaultStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LivenessScanner,
  uploadLivenessDataUrl,
} from "@/components/blockchain/liveness-scanner";
import { AuthenticatedImage } from "@/components/ui/authenticated-image";

const COUNTRIES = [
  "Rwanda",
  "Uganda",
  "Kenya",
  "Tanzania",
  "Burundi",
  "Nigeria",
  "Ghana",
  "South Africa",
  "United States",
  "United Kingdom",
  "Other",
];

type DocType = "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";

type Props = {
  enrollment: ChainContractEnrollment;
  onUpdated: (next: ChainContractEnrollment) => void;
};

async function uploadKycFile(file: File) {
  return api.uploads.kyc(file);
}

function PhasePills({ phase }: { phase: number }) {
  const items = [
    { n: 1, label: "Terms" },
    { n: 2, label: "Verify" },
    { n: 3, label: "Dashboard" },
  ];
  return (
    <ol className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.n}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
            phase === item.n
              ? "border-primary/40 bg-primary/15 text-sky-200"
              : phase > item.n
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 text-gray-500",
          )}
        >
          {phase > item.n ? (
            <Check className="h-3 w-3" />
          ) : (
            <span className="font-mono">{item.n}</span>
          )}
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function DocGuide({ type }: { type: DocType }) {
  const tips =
    type === "PASSPORT"
      ? [
          "Place the passport data page flat on a dark surface",
          "Capture the full page — all corners visible",
          "No glare, fingers, or filters covering MRZ or photo",
          "Passport needs front (data page) only",
        ]
      : [
          "Lay the card flat; capture the full rectangle",
          "Front: photo + name must be sharp and readable",
          type === "NATIONAL_ID"
            ? "Back: barcode / chip side required"
            : "Back of license required",
          "Avoid glare, shadows, and cropped edges",
        ];
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-100">
        <ScanLine className="h-4 w-4" />
        How to scan a valid {type === "PASSPORT" ? "passport" : "ID"}
      </div>
      <ul className="space-y-1.5 text-xs leading-relaxed text-amber-100/80">
        {tips.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="text-amber-400">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UploadSlot({
  label,
  url,
  onUploaded,
  onClear,
}: {
  label: string;
  url: string;
  onUploaded: (url: string) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const res = await uploadKycFile(file);
      onUploaded(res.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {url ? (
        <div className="relative overflow-hidden rounded-xl border border-white/10">
          <AuthenticatedImage
            src={url}
            alt={label}
            className="h-40 w-full object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-sm text-muted hover:border-primary/40">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          {busy ? "Uploading…" : "Tap to upload"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}

function PhaseTerms({
  enrollment,
  onAccepted,
}: {
  enrollment: ChainContractEnrollment;
  onAccepted: (e: ChainContractEnrollment) => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = enrollment.terms;

  async function submit() {
    if (!agreed) return;
    setLoading(true);
    setError("");
    try {
      onAccepted(await api.chainEnrollment.acceptTerms());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept terms");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          On-chain vault contract
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          Enroll once, complete identity + liveness, then deposit after
          approval. The contract only launches when your KYC is approved and you
          fund the vault — until then your dashboard stays empty.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "How it works",
            body: "Agree → verify ID & liveness → wait for approval → deposit USDT → vault activates at your tier yield.",
          },
          {
            title: `$${t.minDepositUsd.toLocaleString()}–$${t.midTierMaxUsd.toLocaleString()}`,
            body: `Indicative ${t.midTierYieldPercent}% starting band on eligible balance — may adjust.`,
          },
          {
            title: `Above $${t.midTierMaxUsd.toLocaleString()}`,
            body: `Indicative ${t.highTierYieldPercent}% starting band. Withdrawals deduct a ${t.withdrawFeePercent}% fee.`,
          },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <p className="text-sm font-semibold text-white">{card.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              {card.body}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm leading-relaxed text-gray-300">
        <p className="mb-3 flex items-center gap-2 font-semibold text-white">
          <FileText className="h-4 w-4 text-primary" />
          Brief contract terms
        </p>
        <ul className="list-disc space-y-2 pl-5 text-gray-400">
          <li>
            Minimum deposit{" "}
            <strong className="text-gray-200">
              ${t.minDepositUsd.toLocaleString()} USDT
            </strong>
            .
          </li>
          <li>
            Indicative yield bands:{" "}
            <strong className="text-gray-200">{t.midTierYieldPercent}%</strong>{" "}
            for ${t.minDepositUsd.toLocaleString()}–$
            {t.midTierMaxUsd.toLocaleString()};{" "}
            <strong className="text-gray-200">{t.highTierYieldPercent}%</strong>{" "}
            above ${t.midTierMaxUsd.toLocaleString()}.
          </li>
          <li>
            {t.yieldDisclaimer ??
              "These percentages are indicative and may change depending on deposit size, available funds, market conditions, and your past behavior on the platform."}
          </li>
          <li>
            Every withdrawal deducts{" "}
            <strong className="text-gray-200">{t.withdrawFeePercent}%</strong>{" "}
            of the withdrawn amount.
          </li>
          <li>
            Contract does not start until KYC is approved and your first deposit
            is confirmed.
          </li>
          <li>
            You also agree to the platform{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms &amp; Conditions
            </Link>
            .
          </li>
        </ul>
      </div>

      <label className="flex items-start gap-3 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 rounded border-white/20"
        />
        <span>
          I have read and agree to the on-chain vault contract terms, yield
          tiers, {t.withdrawFeePercent}% withdrawal fee, and the platform Terms
          &amp; Conditions.
        </span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        size="lg"
        disabled={!agreed || loading}
        onClick={() => void submit()}
        className="gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Agree &amp; continue to verification
      </Button>
    </motion.div>
  );
}

function PhaseKyc({
  enrollment,
  onSubmitted,
}: {
  enrollment: ChainContractEnrollment;
  onSubmitted: (e: ChainContractEnrollment) => void;
}) {
  const [step, setStep] = useState<"docs" | "liveness">("docs");
  const [country, setCountry] = useState(enrollment.country ?? "");
  const [customCountry, setCustomCountry] = useState("");
  const [documentType, setDocumentType] = useState<DocType>(
    enrollment.documentType ?? "NATIONAL_ID",
  );
  const [documentNumber, setDocumentNumber] = useState(
    enrollment.documentNumber ?? "",
  );
  const [frontUrl, setFrontUrl] = useState(enrollment.documentFrontUrl ?? "");
  const [backUrl, setBackUrl] = useState(enrollment.documentBackUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const needsBack = documentType !== "PASSPORT";
  const resolvedCountry =
    country === "Other" ? customCountry.trim() : country.trim();

  const docsReady = useMemo(() => {
    if (!resolvedCountry || !documentNumber.trim() || !frontUrl) return false;
    if (needsBack && !backUrl) return false;
    return true;
  }, [resolvedCountry, documentNumber, frontUrl, backUrl, needsBack]);

  async function goToLiveness() {
    if (!docsReady) return;
    setLoading(true);
    setError("");
    try {
      await api.chainEnrollment.validateDocument({
        country: resolvedCountry,
        documentType,
        documentNumber: documentNumber.trim(),
      });
      setStep("liveness");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Document number looks invalid. Check and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onLivenessComplete(dataUrl: string) {
    setLoading(true);
    setError("");
    try {
      const livenessUrl = await uploadLivenessDataUrl(dataUrl, uploadKycFile);
      const next = await api.chainEnrollment.submitKyc({
        country: resolvedCountry,
        documentType,
        documentNumber: documentNumber.trim(),
        documentFrontUrl: frontUrl,
        documentBackUrl: needsBack ? backUrl : undefined,
        livenessSelfieUrl: livenessUrl,
      });
      onSubmitted(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
      setStep("docs");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-white">Identity verification</h1>
        <p className="mt-2 text-sm text-gray-400">
          Phase 2 — choose your country, upload a valid document, then complete
          head-turn liveness.
        </p>
        {enrollment.status === "KYC_REJECTED" && enrollment.rejectionReason && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Previous submission rejected: {enrollment.rejectionReason}. Please
            resubmit.
          </p>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === "docs" ? (
          <motion.div
            key="docs"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="space-y-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Country</Label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {country === "Other" && (
                  <Input
                    placeholder="Type your country"
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Document number</Label>
                <Input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="ID / passport number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Document to verify</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["NATIONAL_ID", "National ID"],
                    ["PASSPORT", "Passport"],
                    ["DRIVERS_LICENSE", "Driver’s license"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={documentType === value ? "default" : "secondary"}
                    onClick={() => {
                      setDocumentType(value);
                      if (value === "PASSPORT") setBackUrl("");
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <DocGuide type={documentType} />

            <div className="grid gap-4 sm:grid-cols-2">
              <UploadSlot
                label={
                  documentType === "PASSPORT"
                    ? "Passport data page (front)"
                    : "ID front"
                }
                url={frontUrl}
                onUploaded={setFrontUrl}
                onClear={() => setFrontUrl("")}
              />
              {needsBack && (
                <UploadSlot
                  label="ID back"
                  url={backUrl}
                  onUploaded={setBackUrl}
                  onClear={() => setBackUrl("")}
                />
              )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button
              size="lg"
              disabled={!docsReady || loading}
              onClick={() => void goToLiveness()}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {loading ? "Checking ID number…" : "Continue to liveness"}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="liveness"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="space-y-4"
          >
            <p className="text-center text-sm text-gray-400">
              Follow the prompts — rotate your head slowly. The ring fills as
              each pose completes, then turns green.
            </p>
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted">Submitting for review…</p>
              </div>
            ) : (
              <LivenessScanner
                onComplete={(url) => void onLivenessComplete(url)}
                onCancel={() => setStep("docs")}
              />
            )}
            {error && (
              <p className="text-center text-sm text-danger">{error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ContractNullDashboard({
  enrollment,
}: {
  enrollment: ChainContractEnrollment;
}) {
  const t = enrollment.terms;
  const [vault, setVault] = useState<ChainVaultStatus | null>(null);
  const [transferAmount, setTransferAmount] = useState("2000");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loadingVault, setLoadingVault] = useState(
    enrollment.status === "APPROVED" || enrollment.status === "ACTIVE",
  );
  const [action, setAction] = useState<"fund" | "withdraw" | null>(null);
  const [vaultError, setVaultError] = useState("");
  const [vaultMessage, setVaultMessage] = useState("");

  const loadVault = useCallback(async () => {
    if (enrollment.status !== "APPROVED" && enrollment.status !== "ACTIVE") {
      return;
    }
    try {
      setVault(await api.chainEnrollment.vault());
    } catch (error) {
      setVaultError(
        error instanceof Error
          ? error.message
          : "Could not load blockchain wallet",
      );
    } finally {
      setLoadingVault(false);
    }
  }, [enrollment.status]);

  useEffect(() => {
    // Initial remote data fetch belongs to this lifecycle synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVault();
  }, [loadVault]);

  async function fundVault() {
    const amount = Number(transferAmount);
    setAction("fund");
    setVaultError("");
    setVaultMessage("");
    try {
      const next = await api.chainEnrollment.fundVault(amount);
      setVault(next);
      setVaultMessage(
        `$${amount.toFixed(2)} moved into the blockchain wallet and locked for five days.`,
      );
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setAction(null);
    }
  }

  async function withdrawVault() {
    const amount = withdrawAmount.trim() ? Number(withdrawAmount) : undefined;
    setAction("withdraw");
    setVaultError("");
    setVaultMessage("");
    try {
      const next = await api.chainEnrollment.withdrawVault(amount);
      setVault(next);
      setWithdrawAmount("");
      setVaultMessage("Unlocked funds were returned to your platform wallet.");
    } catch (error) {
      setVaultError(
        error instanceof Error ? error.message : "Withdrawal failed",
      );
    } finally {
      setAction(null);
    }
  }

  const transfer = Number(transferAmount);
  const firstTransfer = !vault || vault.principalBalance <= 0;
  const transferValid =
    Number.isFinite(transfer) &&
    transfer > 0 &&
    transfer <= (vault?.platformWalletBalance ?? 0) &&
    (!firstTransfer ||
      transfer >= (vault?.minimumInitialTransfer ?? t.minDepositUsd));
  const unlockLabel = vault?.lockedUntil
    ? new Date(vault.lockedUntil).toLocaleString()
    : "Not funded";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
          Contract dashboard
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">
          {enrollment.status === "KYC_PENDING"
            ? "Under review"
            : enrollment.status === "APPROVED" || enrollment.status === "ACTIVE"
              ? "Blockchain wallet"
              : enrollment.status === "KYC_REJECTED"
                ? "Verification rejected"
                : "Awaiting activation"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-gray-400">
          {enrollment.status === "KYC_PENDING"
            ? "Your documents and liveness are with the team. Balances, yield, and activity stay empty until approval."
            : enrollment.status === "APPROVED" || enrollment.status === "ACTIVE"
              ? "Transfer funds from your platform wallet. Principal and every profit credit remain locked together for five days before withdrawal."
              : "Complete verification to continue."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          {
            label: "Principal",
            value: vault ? `$${vault.principalBalance.toFixed(2)}` : "—",
          },
          {
            label: "Locked profit",
            value: vault ? `$${vault.profitBalance.toFixed(2)}` : "—",
          },
          {
            label: "Daily rate",
            value: vault
              ? `${vault.yieldPercent}%`
              : `${t.midTierYieldPercent}%–${t.highTierYieldPercent}%`,
          },
          {
            label: "Unlock",
            value: vault?.totalBalance
              ? vault.unlocked
                ? "Available"
                : unlockLabel
              : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5"
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-gray-300">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {(enrollment.status === "APPROVED" || enrollment.status === "ACTIVE") && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-white">
              Five-day principal + profit lock
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Every transfer starts or resets a five-day lock on the complete
            blockchain wallet. Neither principal nor profit can leave before{" "}
            {unlockLabel}. Withdrawals carry the configured{" "}
            {vault?.withdrawFeePercent ?? t.withdrawFeePercent}% fee.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="font-semibold text-white">Transfer from wallet</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                Platform wallet available: $
                {(vault?.platformWalletBalance ?? 0).toFixed(2)} USDT. The first
                transfer must be at least $
                {(
                  vault?.minimumInitialTransfer ?? t.minDepositUsd
                ).toLocaleString()}
                .
              </p>
              <div className="mt-4 space-y-3">
                <Input
                  type="number"
                  min={
                    firstTransfer
                      ? (vault?.minimumInitialTransfer ?? t.minDepositUsd)
                      : 0.01
                  }
                  step="0.01"
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                />
                <Button
                  disabled={!vault || !transferValid || action !== null}
                  onClick={() => void fundVault()}
                  className="w-full"
                >
                  {action === "fund" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Transfer and lock
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/wallet">
                    <Wallet className="h-4 w-4" />
                    Add funds to platform wallet
                  </Link>
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="font-semibold text-white">Withdraw after unlock</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                Available blockchain balance: $
                {(vault?.totalBalance ?? 0).toFixed(2)} USDT. Leave amount empty
                to withdraw everything.
              </p>
              <div className="mt-4 space-y-3">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Full balance"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={
                    !vault ||
                    !vault.unlocked ||
                    vault.totalBalance <= 0 ||
                    action !== null
                  }
                  onClick={() => void withdrawVault()}
                  className="w-full"
                >
                  {action === "withdraw" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Return to platform wallet
                </Button>
              </div>
              {!vault?.unlocked && (vault?.totalBalance ?? 0) > 0 && (
                <p className="mt-3 text-xs text-amber-300">
                  Locked until {unlockLabel}
                </p>
              )}
            </div>
          </div>
          {vaultMessage && (
            <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {vaultMessage}
            </p>
          )}
          {vaultError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {vaultError}
            </p>
          )}
          {loadingVault && (
            <p className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading blockchain wallet…
            </p>
          )}
          {(vault?.recentCredits.length ?? 0) > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">
                Daily profit history
              </p>
              <div className="mt-3 divide-y divide-white/10">
                {vault?.recentCredits.map((credit) => (
                  <div
                    key={credit.id}
                    className="flex items-center justify-between gap-3 py-2 text-xs"
                  >
                    <span className="text-gray-400">
                      {new Date(credit.creditDate).toLocaleDateString()} ·{" "}
                      {credit.yieldPercent}% on ${credit.baseBalance.toFixed(2)}
                    </span>
                    <strong className="text-emerald-300">
                      +${credit.amount.toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Daily profit is added to the locked blockchain balance and emailed
            to your registered address. A new transfer restarts the five-day
            lock for the full balance.
          </p>
        </div>
      )}
    </div>
  );
}

export function ContractEnrollFlow({ enrollment, onUpdated }: Props) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const phase =
    enrollment.status === "NOT_STARTED"
      ? 1
      : enrollment.status === "TERMS_ACCEPTED" ||
          enrollment.status === "KYC_REJECTED"
        ? 2
        : 3;

  async function cancelAndRestart() {
    if (
      !window.confirm(
        "Cancel enrollment and start over? Your terms acceptance and KYC for this contract will be cleared.",
      )
    ) {
      return;
    }
    setCancelling(true);
    setCancelError("");
    try {
      onUpdated(await api.chainEnrollment.cancel());
    } catch (e) {
      setCancelError(
        e instanceof Error ? e.message : "Could not cancel enrollment",
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PhasePills phase={phase} />
        {enrollment.canCancelRestart !== false &&
          enrollment.status !== "NOT_STARTED" && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={cancelling}
              onClick={() => void cancelAndRestart()}
              className="gap-2"
            >
              {cancelling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Cancel &amp; restart
            </Button>
          )}
      </div>
      {cancelError && <p className="text-sm text-danger">{cancelError}</p>}
      {phase === 1 && (
        <PhaseTerms enrollment={enrollment} onAccepted={onUpdated} />
      )}
      {phase === 2 && (
        <PhaseKyc enrollment={enrollment} onSubmitted={onUpdated} />
      )}
      {phase === 3 && <ContractNullDashboard enrollment={enrollment} />}
    </div>
  );
}

export function useChainEnrollment() {
  const [enrollment, setEnrollment] = useState<ChainContractEnrollment | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setEnrollment(await api.chainEnrollment.get());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load enrollment");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial remote data fetch belongs to this lifecycle synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { enrollment, setEnrollment, loading, error, refresh };
}
