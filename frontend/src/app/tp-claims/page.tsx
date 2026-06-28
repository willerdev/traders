"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";
import { api, type TpClaimRecord, type UserSettings } from "@/lib/api";
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
import { PayoutRequestForm } from "@/components/payments/payout-request-form";

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

function payoutStatusLabel(status: string, hasWallet: boolean) {
  if (status === "PENDING" && hasWallet) return "Awaiting admin approval";
  if (status === "PENDING") return "Pending";
  return status;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function TpClaimsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [claims, setClaims] = useState<TpClaimRecord[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resubmitModal, setResubmitModal] = useState<{
    claimId: string;
    signalId: string;
    symbol: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, userSettings] = await Promise.all([
        api.tpClaims.list(),
        api.users.settings().catch(() => null),
      ]);
      setClaims(list);
      setSettings(userSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load TP claims");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
    else void load();
  }, [isAuthenticated, router]);

  const pending = claims.filter((c) => c.status === "PENDING_REVIEW");
  const readyForPayout = claims.filter((c) => c.canRequestPayout);
  const kycStatus = settings?.kyc?.status ?? "NOT_STARTED";
  const kycApproved = kycStatus === "APPROVED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">TP Claims</h1>
            <p className="mt-1 text-sm text-gray-400">
              Track take-profit claims and request USDT payout after approval
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {!kycApproved && readyForPayout.length > 0 && (
          <Card className="mb-6 border-rank-gold/30 bg-rank-gold/5">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rank-gold" />
                <div>
                  <p className="font-semibold text-white">KYC required to withdraw</p>
                  <p className="text-sm text-gray-400">
                    Complete identity verification before requesting TP reward payouts.
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

        {readyForPayout.length > 0 && kycApproved && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-primary" />
                Ready for payout
              </CardTitle>
              <CardDescription>
                {readyForPayout.length} approved claim
                {readyForPayout.length !== 1 ? "s" : ""} can be withdrawn as USDT
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
        ) : claims.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                No TP claims yet
              </CardTitle>
              <CardDescription>
                When you claim take profit from the dashboard, your before/after
                screenshots appear here until an admin approves or rejects them.
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
                            Approved {fmtDate(claim.reviewedAt)} —{" "}
                            {formatCurrency(claim.rewardAmount ?? 5)} reward credited.
                          </p>
                        )}

                        {claim.canRequestPayout && (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <p className="mb-3 text-sm font-medium text-white">
                              Request {formatCurrency(claim.rewardAmount ?? 5)} USDT payout
                            </p>
                            <PayoutRequestForm
                              disabled={!kycApproved}
                              settings={settings}
                              submitLabel="Request TP payout"
                              onSubmit={async (walletAddress) => {
                                await api.tpClaims.requestPayout(claim.id, walletAddress);
                                await load();
                              }}
                            />
                          </div>
                        )}

                        {claim.payout && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-gray-300">
                                Payout {formatCurrency(claim.payout.amount)}
                              </span>
                              <Badge variant="secondary">
                                {payoutStatusLabel(
                                  claim.payout.status,
                                  Boolean(claim.payout.walletAddress),
                                )}
                              </Badge>
                            </div>
                            {claim.payout.walletAddress && (
                              <p className="mt-1 truncate font-mono text-xs text-gray-500">
                                {claim.payout.walletAddress}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-gray-600">
                              Requested {fmtDate(claim.payout.requestedAt)}
                            </p>
                            <Link
                              href="/payouts"
                              className="mt-2 inline-block text-xs text-primary hover:underline"
                            >
                              View all payouts
                            </Link>
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

      {resubmitModal && (
        <ClaimTpModal
          claimId={resubmitModal.claimId}
          signalId={resubmitModal.signalId}
          symbol={resubmitModal.symbol}
          onClose={() => setResubmitModal(null)}
          onSubmitted={() => {
            setResubmitModal(null);
            void load();
          }}
          onError={(msg) => setError(msg)}
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
