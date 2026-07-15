"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { api, type ClaimableTpSetup, type TpClaimRecord, type UserSettings } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wallet,
  XCircle,
  Target,
} from "lucide-react";
import { ClaimTpModal } from "@/components/dashboard/claim-tp-modal";

function statusBadge(status: TpClaimRecord["status"]) {
  switch (status) {
    case "PENDING_REVIEW":
      return { variant: "secondary" as const, label: "Awaiting review", icon: Clock };
    case "APPROVED":
      return { variant: "success" as const, label: "Approved", icon: CheckCircle2 };
    case "REJECTED":
      return { variant: "danger" as const, label: "Rejected", icon: XCircle };
  }
}

function payoutStatusLabel(status: string) {
  if (status === "PAID") return "Credited to wallet";
  if (status === "PENDING") return "Awaiting payout approval";
  if (status === "REJECTED") return "Payout rejected";
  return status;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function TpClaimsPage() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [claims, setClaims] = useState<TpClaimRecord[]>([]);
  const [claimable, setClaimable] = useState<ClaimableTpSetup[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resubmitModal, setResubmitModal] = useState<{
    claimId: string;
    signalId: string;
    symbol: string;
  } | null>(null);
  const [claimModal, setClaimModal] = useState<{
    signalId: string;
    symbol: string;
    claimType: "full" | "rr_1_1";
    oneToOnePrice?: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, claimableResult, userSettings] = await Promise.all([
        api.tpClaims.list(),
        api.signals.claimableTps().catch(() => ({ items: [], count: 0 })),
        api.users.settings().catch(() => null),
      ]);
      setClaims(list);
      setClaimable(claimableResult.items);
      setSettings(userSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load TP claims");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready]);

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  const pending = claims.filter((c) => c.status === "PENDING_REVIEW");
  const awaitingWallet = claims.filter(
    (c) => c.awaitsPayoutApproval || (c.status === "APPROVED" && c.payout?.status === "PENDING"),
  );
  const kycStatus = settings?.kyc?.status ?? "NOT_STARTED";
  const kycApproved = kycStatus === "APPROVED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">TP Claims</h1>
            <p className="mt-1 text-sm text-gray-400">
              Claim take profit when price hits TP1 or full TP — submit evidence here.
              After admin payout approval, the reward is credited to your platform wallet.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {success && (
          <p className="mb-6 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            {success}
          </p>
        )}

        {claimable.length > 0 && (
          <Card className="mb-6 border-success/30 bg-success/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-success" />
                Ready to claim
              </CardTitle>
              <CardDescription>
                {claimable.length} setup{claimable.length !== 1 ? "s" : ""} reached TP1 or
                full TP — upload before/after screenshots to claim (no payout required yet).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {claimable.map((setup) => (
                <div
                  key={setup.signalId}
                  className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{setup.symbol}</span>
                      <Badge variant={setup.direction === "BUY" ? "success" : "danger"}>
                        {setup.direction}
                      </Badge>
                      {setup.canClaimTp1R1 && (
                        <Badge variant="secondary">TP1 (1:1) reached</Badge>
                      )}
                      {setup.canClaimFullTp && (
                        <Badge variant="success">Full TP reached</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Entry {setup.entryMin} – {setup.entryMax}
                      {setup.oneToOnePrice != null && setup.canClaimTp1R1
                        ? ` · TP1 ${setup.oneToOnePrice}`
                        : ""}
                      {setup.currentPrice != null ? ` · Now ${setup.currentPrice}` : ""}
                    </p>
                    {setup.executionLabel && (
                      <p className="mt-1 text-xs text-gray-500">{setup.executionLabel}</p>
                    )}
                    {setup.canClaimTp1R1 && setup.breakevenSet && (
                      <p className="mt-1 text-xs text-success/90">
                        TP1 or partial close with breakeven set — ready to claim 1:1 RR.
                      </p>
                    )}
                    {setup.tp1ClaimBlockedReason && !setup.canClaimTp1R1 && (
                      <p className="mt-1 text-xs text-amber-300/90">
                        {setup.tp1ClaimBlockedReason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {setup.canClaimTp1R1 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-success/40 text-success"
                        onClick={() =>
                          setClaimModal({
                            signalId: setup.signalId,
                            symbol: setup.symbol,
                            claimType: "rr_1_1",
                            oneToOnePrice: setup.oneToOnePrice,
                          })
                        }
                      >
                        Claim 1:1 RR
                      </Button>
                    )}
                    {setup.canClaimFullTp && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() =>
                          setClaimModal({
                            signalId: setup.signalId,
                            symbol: setup.symbol,
                            claimType: "full",
                          })
                        }
                      >
                        Claim full TP
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!kycApproved && awaitingWallet.length > 0 && (
          <Card className="mb-6 border-rank-gold/30 bg-rank-gold/5">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rank-gold" />
                <div>
                  <p className="font-semibold text-white">KYC required to withdraw</p>
                  <p className="text-sm text-gray-400">
                    Once your reward hits the wallet, KYC is required before you can withdraw.
                  </p>
                </div>
              </div>
              <Link href="/settings">
                <Button variant="secondary" size="sm">
                  Complete KYC
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {awaitingWallet.length > 0 && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-primary" />
                Awaiting payout approval
              </CardTitle>
              <CardDescription>
                {awaitingWallet.length} approved claim
                {awaitingWallet.length !== 1 ? "s" : ""} waiting for an admin to credit
                your platform wallet.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {pending.length > 0 && (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-center gap-3 py-4 text-sm">
              <Clock className="h-5 w-5 shrink-0 text-amber-400" />
              <span>
                {pending.length} claim{pending.length !== 1 ? "s" : ""} awaiting admin
                review.
              </span>
            </CardContent>
          </Card>
        )}

        {loading && claims.length === 0 ? (
          <div className="flex justify-center py-16 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : claims.length === 0 && claimable.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                No TP claims yet
              </CardTitle>
              <CardDescription>
                When price hits TP1 (1:1 RR) or full take profit on an open setup, it
                appears here so you can submit before/after screenshots. You will also
                get an email when TP1 is reached.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard">
                <Button variant="secondary">Go to dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {claims.map((claim) => {
              const badge = statusBadge(claim.status);
              const Icon = badge.icon;
              return (
                <Card key={claim.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">
                          {claim.symbol}{" "}
                          <span className="text-base font-normal text-muted">
                            {claim.direction}
                          </span>
                        </CardTitle>
                        <Badge variant={badge.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {badge.label}
                        </Badge>
                        {claim.claimType === "RR_1_TO_1" && (
                          <Badge variant="secondary">1:1 RR</Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        Submitted {fmtDate(claim.submittedAt)}
                      </span>
                    </div>
                    {claim.setup && (
                      <CardDescription>
                        Entry {claim.setup.entryMin} – {claim.setup.entryMax} · TP{" "}
                        {claim.setup.takeProfit} · SL {claim.setup.stopLoss}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ScreenshotThumb label="Before" url={claim.beforeScreenshotUrl} />
                      <ScreenshotThumb label="After (TP)" url={claim.afterScreenshotUrl} />
                    </div>

                    {claim.status === "PENDING_REVIEW" && (
                      <p className="text-sm text-amber-200/80">
                        Under review — an admin is verifying your chart evidence.
                      </p>
                    )}

                    {claim.status === "APPROVED" && (
                      <div className="space-y-3">
                        {claim.reviewedAt && (
                          <p className="text-sm text-success">
                            Approved {fmtDate(claim.reviewedAt)}
                            {claim.walletCredited || claim.payout?.status === "PAID"
                              ? ` — ${formatCurrency(claim.rewardAmount ?? 5)} credited to your platform wallet.`
                              : ` — ${formatCurrency(claim.rewardAmount ?? 5)} is queued for payout approval.`}
                            {(claim.walletCredited || claim.payout?.status === "PAID") && (
                              <>
                                {" "}
                                <Link
                                  href="/wallet"
                                  className="text-primary hover:underline"
                                >
                                  View wallet
                                </Link>
                              </>
                            )}
                          </p>
                        )}

                        {claim.payout && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-gray-300">
                                Payout {formatCurrency(claim.payout.amount)}
                              </span>
                              <Badge variant="secondary">
                                {payoutStatusLabel(claim.payout.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                              {claim.payout.status === "PAID"
                                ? `Processed ${fmtDate(claim.payout.requestedAt)}`
                                : `Queued ${fmtDate(claim.payout.requestedAt)}`}
                            </p>
                            {claim.payout.status === "PAID" && (
                              <Link
                                href="/wallet"
                                className="mt-2 inline-block text-xs text-primary hover:underline"
                              >
                                Open wallet
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {claim.status === "REJECTED" && (
                      <div className="space-y-3">
                        <p className="text-sm text-danger">
                          Rejected
                          {claim.reviewedAt ? ` ${fmtDate(claim.reviewedAt)}` : ""}
                          {claim.adminNote ? `: ${claim.adminNote}` : ""}.
                        </p>
                        {claim.canResubmit ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              setResubmitModal({
                                claimId: claim.id,
                                signalId: claim.signalId,
                                symbol: claim.symbol,
                              })
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reapply with new screenshots
                          </Button>
                        ) : (
                          <p className="text-sm text-muted">
                            This setup is no longer open, so it cannot be resubmitted.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </motion.div>

      {claimModal && (
        <ClaimTpModal
          signalId={claimModal.signalId}
          symbol={claimModal.symbol}
          claimType={claimModal.claimType}
          oneToOnePrice={claimModal.oneToOnePrice}
          onClose={() => setClaimModal(null)}
          onSubmitted={(msg) => {
            setClaimModal(null);
            setSuccess(msg);
            void load();
          }}
        />
      )}

      {resubmitModal && (
        <ClaimTpModal
          claimId={resubmitModal.claimId}
          signalId={resubmitModal.signalId}
          symbol={resubmitModal.symbol}
          onClose={() => setResubmitModal(null)}
          onSubmitted={(msg) => {
            setResubmitModal(null);
            setSuccess(msg || "TP claim resubmitted for review.");
            void load();
          }}
        />
      )}
    </div>
  );
}

function ScreenshotThumb({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="max-h-36 w-full object-contain" />
      </div>
    </div>
  );
}
