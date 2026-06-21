"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  DollarSign,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";
import { api, type AdminKycItem, type AdminOverview, type AdminPayoutItem } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [kycQueue, setKycQueue] = useState<AdminKycItem[]>([]);
  const [payoutQueue, setPayoutQueue] = useState<AdminPayoutItem[]>([]);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    void loadData();
  }, [isAuthenticated, user, router]);

  async function loadData() {
    setLoading(true);
    try {
      const [ov, kyc, payouts] = await Promise.all([
        api.admin.overview(),
        api.admin.pendingKyc(),
        api.admin.pendingPayouts(),
      ]);
      setOverview(ov);
      setKycQueue(kyc);
      setPayoutQueue(payouts);
    } catch {
      setMessage("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function approveKyc(userId: string) {
    setActionLoading(`kyc-approve-${userId}`);
    try {
      await api.admin.approveKyc(userId);
      setMessage("KYC approved");
      await loadData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectKyc(userId: string) {
    setActionLoading(`kyc-reject-${userId}`);
    try {
      await api.admin.rejectKyc(userId, rejectReason[userId] || "Documents unclear");
      setMessage("KYC rejected");
      await loadData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function approvePayout(payoutId: string) {
    setActionLoading(`payout-${payoutId}`);
    try {
      await api.admin.approvePayout(payoutId);
      setMessage("Payout approved and sent");
      await loadData();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Admin Console</h1>
        <p className="mt-1 text-sm text-muted">
          Revenue, compliance, and payout operations
        </p>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
          {message}
        </div>
      )}

      {overview && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-success" />
                <div>
                  <p className="text-xs text-muted">Registration revenue</p>
                  <p className="text-xl font-bold text-foreground">
                    {formatCurrency(Number(overview.totalRevenue))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-xs text-muted">Active traders</p>
                  <p className="text-xl font-bold text-foreground">
                    {overview.activeTraders} / {overview.totalUsers}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-rank-gold" />
                <div>
                  <p className="text-xs text-muted">KYC pending</p>
                  <p className="text-xl font-bold text-foreground">
                    {overview.pendingKycCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-xs text-muted">Payouts pending</p>
                  <p className="text-xl font-bold text-foreground">
                    {overview.pendingPayouts.count}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>KYC Review Queue</CardTitle>
            <CardDescription>Approve identity before payouts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kycQueue.length === 0 ? (
              <p className="text-sm text-muted">No pending KYC submissions</p>
            ) : (
              kycQueue.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--color-border)] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {item.user.displayName}
                      </p>
                      <p className="text-xs text-muted">{item.user.email}</p>
                      <Badge variant="secondary" className="mt-1">
                        {item.documentType}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {item.documentFrontUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.documentFrontUrl}
                        alt="Document"
                        className="h-16 w-16 rounded object-cover"
                      />
                    )}
                    {item.selfieUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.selfieUrl}
                        alt="Selfie"
                        className="h-16 w-16 rounded object-cover"
                      />
                    )}
                  </div>
                  <Input
                    placeholder="Rejection reason (if rejecting)"
                    value={rejectReason[item.userId] || ""}
                    onChange={(e) =>
                      setRejectReason({
                        ...rejectReason,
                        [item.userId]: e.target.value,
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={actionLoading !== null}
                      onClick={() => void approveKyc(item.userId)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1 text-danger"
                      disabled={actionLoading !== null}
                      onClick={() => void rejectKyc(item.userId)}
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payout Approvals</CardTitle>
            <CardDescription>KYC-verified traders only</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {payoutQueue.length === 0 ? (
              <p className="text-sm text-muted">No pending payouts</p>
            ) : (
              payoutQueue.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-4"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {p.user.displayName}
                    </p>
                    <p className="text-sm text-primary">
                      {formatCurrency(Number(p.traderShare))}
                    </p>
                    <p className="text-xs text-muted truncate max-w-[200px]">
                      {p.walletAddress || "No wallet"}
                    </p>
                    <Badge
                      variant={
                        p.user.kyc?.status === "APPROVED" ? "success" : "danger"
                      }
                      className="mt-1"
                    >
                      KYC: {p.user.kyc?.status ?? "NONE"}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    disabled={
                      actionLoading !== null ||
                      p.user.kyc?.status !== "APPROVED" ||
                      !p.walletAddress
                    }
                    onClick={() => void approvePayout(p.id)}
                  >
                    Approve
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
