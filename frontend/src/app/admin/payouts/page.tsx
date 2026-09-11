"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useAuthStore, useDashboardStore } from "@/stores/auth";
import {
  api,
  type AdminApprovePayoutResponse,
  type AdminPayoutItem,
  type StaffDispatchPreviewResponse,
} from "@/lib/api";
import {
  canApproveAdminPayouts,
  canCreateStaffDispatch,
} from "@/lib/copy-access";
import { formatCurrency } from "@/lib/utils";
import { Clock, Loader2, ShieldCheck } from "lucide-react";

function payoutAmount(p: AdminPayoutItem) {
  const n = Number(p.traderShare);
  return Number.isFinite(n) ? n : 0;
}

function payoutSourceLabel(p: AdminPayoutItem) {
  if (p.source === "DEPOSITOR") return "Wallet withdrawal";
  if (p.source === "TP_REWARD") return "TP reward";
  return "Weekly tier";
}

function canApproveRow(p: AdminPayoutItem, externalSettlement: boolean) {
  if (p.user.kyc?.status !== "APPROVED") return false;
  if (p.source === "DEPOSITOR" && !p.walletAddress?.trim()) return false;
  if (p.source === "DEPOSITOR" && !externalSettlement) {
    // Gateway path — backend validates custody; allow attempt if wallet set.
    return Boolean(p.walletAddress?.trim());
  }
  return true;
}

function canRefundRow(p: AdminPayoutItem) {
  return p.source === "DEPOSITOR" && p.status !== "REJECTED";
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const authUser = useAuthStore((s) => s.user);
  const dashboardUser = useDashboardStore((s) => s.data?.user);

  const [items, setItems] = useState<AdminPayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<AdminPayoutItem | null>(
    null,
  );
  const [externalSettlement, setExternalSettlement] = useState(false);
  const [refundTarget, setRefundTarget] = useState<AdminPayoutItem | null>(
    null,
  );
  const [refundReason, setRefundReason] = useState("");
  const [verifyTarget, setVerifyTarget] = useState<AdminPayoutItem | null>(
    null,
  );
  const [verifyCode, setVerifyCode] = useState("");
  const [dispatchPreview, setDispatchPreview] =
    useState<StaffDispatchPreviewResponse | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [selectedDispatchIds, setSelectedDispatchIds] = useState<string[]>([]);

  const userEmail = dashboardUser?.email ?? authUser?.email ?? "";
  const dispatchOperator = canCreateStaffDispatch(userEmail);

  const access = useMemo(() => {
    const role = dashboardUser?.role ?? authUser?.role;
    const adminPermissions =
      dashboardUser?.adminPermissions ?? authUser?.adminPermissions;
    return { role, adminPermissions };
  }, [authUser, dashboardUser]);

  const allowed = canApproveAdminPayouts(access);

  const reload = useCallback(async () => {
    setError("");
    const res = await api.admin.listPayouts(
      statusFilter === "ALL" ? undefined : statusFilter,
    );
    setItems(res.items);
  }, [statusFilter]);

  useEffect(() => {
    if (!ready) return;
    if (!canApproveAdminPayouts(access)) {
      router.replace("/dashboard");
      return;
    }
    setLoading(true);
    reload()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load payouts");
      })
      .finally(() => setLoading(false));
  }, [ready, access, router, reload]);

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  if (!allowed) {
    return null;
  }

  async function confirmApprove() {
    if (!approveTarget) return;
    setBusyId(approveTarget.id);
    setError("");
    setMessage("");
    try {
      const res: AdminApprovePayoutResponse = await api.admin.approvePayout(
        approveTarget.id,
        externalSettlement ? "external" : "gateway",
      );
      if (res.verificationRequired) {
        setMessage(
          res.message ??
            "Payout queued — enter NOWPayments 2FA code to complete send.",
        );
        setVerifyTarget(approveTarget);
      } else {
        setMessage(
          res.message ??
            (res.creditedToWallet
              ? "Reward credited to user wallet."
              : "Payout approved."),
        );
      }
      setApproveTarget(null);
      setExternalSettlement(false);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRefund() {
    if (!refundTarget) return;
    setBusyId(refundTarget.id);
    setError("");
    setMessage("");
    try {
      const res = await api.admin.refundPayout(
        refundTarget.id,
        refundReason.trim() || undefined,
      );
      setMessage(res.message ?? "Payout refunded to user wallet.");
      setRefundTarget(null);
      setRefundReason("");
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusyId(null);
    }
  }

  const dispatchEligible = useMemo(
    () =>
      items.filter(
        (p) =>
          p.status === "PENDING" &&
          p.source === "DEPOSITOR" &&
          p.walletAddress?.trim() &&
          !p.scheduledApproveAt,
      ),
    [items],
  );

  async function loadDispatchPreview() {
    setDispatchLoading(true);
    setError("");
    try {
      const res = await api.admin.previewStaffDispatch(
        selectedDispatchIds.length > 0
          ? { payoutIds: selectedDispatchIds }
          : undefined,
      );
      setDispatchPreview(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Dispatch preview failed");
      setDispatchPreview(null);
    } finally {
      setDispatchLoading(false);
    }
  }

  async function createDispatch() {
    if (
      !window.confirm(
        "Create dispatch? Payouts will be scheduled low→high with 2 hours between each. Ops will be emailed.",
      )
    ) {
      return;
    }
    setDispatchLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await api.admin.createStaffDispatch(
        selectedDispatchIds.length > 0
          ? { payoutIds: selectedDispatchIds }
          : undefined,
      );
      setMessage(res.message);
      setDispatchPreview(res);
      setSelectedDispatchIds([]);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create dispatch failed");
    } finally {
      setDispatchLoading(false);
    }
  }

  function toggleDispatchSelection(payoutId: string) {
    setSelectedDispatchIds((prev) =>
      prev.includes(payoutId)
        ? prev.filter((id) => id !== payoutId)
        : [...prev, payoutId],
    );
    setDispatchPreview(null);
  }

  async function confirmVerify() {
    if (!verifyTarget || !verifyCode.trim()) return;
    setBusyId(verifyTarget.id);
    setError("");
    setMessage("");
    try {
      const res = await api.admin.verifyPayout(
        verifyTarget.id,
        verifyCode.trim(),
      );
      setMessage(res.message ?? "2FA verified — payout sent.");
      setVerifyTarget(null);
      setVerifyCode("");
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusyId(null);
    }
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case "PAID":
        return "success" as const;
      case "APPROVED":
        return "default" as const;
      case "REJECTED":
        return "danger" as const;
      default:
        return "secondary" as const;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">
              Admin
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Payout approvals</h1>
          <p className="text-sm text-muted">
            Approve, deny (refund), or verify pending withdrawals. Ops receives
            an email copy of each action.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["PENDING", "APPROVED", "PAID", "REJECTED", "ALL"] as const).map(
            (s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "secondary"}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Button>
            ),
          )}
        </div>
      </motion.div>

      {dispatchOperator && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Create dispatch
            </CardTitle>
            <CardDescription>
              Schedule pending wallet withdrawals{" "}
              <strong>low → high amount</strong>,{" "}
              <strong>2 hours</strong> apart. First payout defaults to 2 hours
              from now. Cron auto-approves when each slot is due.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={dispatchLoading || dispatchEligible.length === 0}
                onClick={() => void loadDispatchPreview()}
              >
                {dispatchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Preview schedule"
                )}
              </Button>
              <Button
                disabled={
                  dispatchLoading ||
                  (!dispatchPreview && dispatchEligible.length === 0)
                }
                onClick={() => void createDispatch()}
              >
                Create dispatch
              </Button>
              <span className="self-center text-sm text-muted">
                {selectedDispatchIds.length > 0
                  ? `${selectedDispatchIds.length} selected`
                  : `${dispatchEligible.length} eligible (all if none selected)`}
              </span>
            </div>
            {dispatchPreview && dispatchPreview.count > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-muted">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Scheduled (EAT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchPreview.schedule.map((row) => (
                      <tr
                        key={row.payoutId}
                        className="border-b border-[var(--color-border)]/60"
                      >
                        <td className="px-3 py-2">{row.position}</td>
                        <td className="px-3 py-2">
                          <div>{row.displayName}</div>
                          <div className="text-xs text-muted">{row.email}</div>
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="px-3 py-2">{row.scheduledAtEat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-3 py-2 text-xs text-muted">
                  Total {formatCurrency(dispatchPreview.totalAmount)} · First
                  slot {dispatchPreview.firstAtEat} EAT
                </p>
              </div>
            )}
            {dispatchPreview?.count === 0 && (
              <p className="text-sm text-muted">
                No unscheduled pending wallet withdrawals match this selection.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>
            {items.length} payout{items.length === 1 ? "" : "s"}
            {statusFilter !== "ALL" ? ` (${statusFilter.toLowerCase()})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              No payouts in this filter.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-muted">
                  {dispatchOperator && (
                    <th className="px-4 py-3 font-medium">Dispatch</th>
                  )}
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Wallet</th>
                  <th className="px-4 py-3 font-medium">KYC</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const dispatchSelectable =
                    dispatchOperator &&
                    p.status === "PENDING" &&
                    p.source === "DEPOSITOR" &&
                    p.walletAddress?.trim() &&
                    !p.scheduledApproveAt;
                  return (
                  <tr
                    key={p.id}
                    className="border-b border-[var(--color-border)]/60"
                  >
                    {dispatchOperator && (
                      <td className="px-4 py-3">
                        {dispatchSelectable ? (
                          <input
                            type="checkbox"
                            checked={selectedDispatchIds.includes(p.id)}
                            onChange={() => toggleDispatchSelection(p.id)}
                            aria-label={`Include ${p.user.displayName} in dispatch`}
                          />
                        ) : p.scheduledApproveAt ? (
                          <span className="text-xs text-muted">Scheduled</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.user.displayName}</div>
                      <div className="text-xs text-muted">{p.user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {payoutSourceLabel(p)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatCurrency(payoutAmount(p))}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs text-muted">
                      {p.walletAddress || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.user.kyc?.status ?? "NONE"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {p.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              disabled={
                                busyId === p.id ||
                                !canApproveRow(p, externalSettlement)
                              }
                              onClick={() => {
                                setApproveTarget(p);
                                setExternalSettlement(false);
                                setError("");
                              }}
                            >
                              Approve
                            </Button>
                            {canRefundRow(p) && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busyId === p.id}
                                onClick={() => {
                                  setRefundTarget(p);
                                  setRefundReason("");
                                  setError("");
                                }}
                              >
                                Deny
                              </Button>
                            )}
                          </>
                        )}
                        {p.status === "APPROVED" && p.gatewayPayoutId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === p.id}
                            onClick={() => {
                              setVerifyTarget(p);
                              setVerifyCode("");
                              setError("");
                            }}
                          >
                            2FA
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Confirm approval</CardTitle>
              <CardDescription>
                {approveTarget.user.displayName} —{" "}
                {formatCurrency(payoutAmount(approveTarget))}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Email</dt>
                  <dd>{approveTarget.user.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Wallet</dt>
                  <dd className="max-w-[200px] truncate font-mono text-xs">
                    {approveTarget.walletAddress || "Not set"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">KYC</dt>
                  <dd>{approveTarget.user.kyc?.status ?? "NONE"}</dd>
                </div>
              </dl>
              {approveTarget.source === "DEPOSITOR" && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={externalSettlement}
                    onChange={(e) => setExternalSettlement(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Paid externally (MoMo / bank / manual USDT) — mark paid
                    without NOWPayments gateway
                  </span>
                </label>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busyId === approveTarget.id}
                  onClick={() => {
                    setApproveTarget(null);
                    setExternalSettlement(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    busyId === approveTarget.id ||
                    !canApproveRow(approveTarget, externalSettlement)
                  }
                  onClick={() => void confirmApprove()}
                >
                  {busyId === approveTarget.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : externalSettlement ? (
                    "Mark paid"
                  ) : (
                    "Approve"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Deny & refund</CardTitle>
              <CardDescription>
                Returns {formatCurrency(payoutAmount(refundTarget))} to the
                user&apos;s platform wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="w-full rounded-xl border border-[var(--color-border)] bg-background/40 px-3 py-2 text-sm"
                rows={3}
                placeholder="Reason (optional)"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busyId === refundTarget.id}
                  onClick={() => setRefundTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={busyId === refundTarget.id}
                  onClick={() => void confirmRefund()}
                >
                  {busyId === refundTarget.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Refund to wallet"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {verifyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>NOWPayments 2FA</CardTitle>
              <CardDescription>
                Enter the verification code to complete{" "}
                {verifyTarget.user.displayName}&apos;s payout send.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                className="w-full rounded-xl border border-[var(--color-border)] bg-background/40 px-3 py-2 text-sm"
                placeholder="6-digit code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busyId === verifyTarget.id}
                  onClick={() => {
                    setVerifyTarget(null);
                    setVerifyCode("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={busyId === verifyTarget.id || !verifyCode.trim()}
                  onClick={() => void confirmVerify()}
                >
                  {busyId === verifyTarget.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify & send"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
