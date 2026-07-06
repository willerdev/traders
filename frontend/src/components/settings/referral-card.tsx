"use client";

import { useEffect, useState } from "react";
import { Gift, Copy, Check, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type ReferralInfo } from "@/lib/api";

export function ReferralCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referrals
      .me()
      .then(setInfo)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load referrals"),
      );
  }, []);

  async function copyLink() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — long-press the link to copy it manually");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <CardTitle>Invite friends, earn USDT</CardTitle>
        </div>
        <CardDescription>
          {info
            ? `Earn $${info.rewards.kycRewardUsdt} when a friend you invite completes KYC, and $${info.rewards.paidRewardUsdt} when they subscribe. Rewards go straight to your wallet.`
            : "Share your personal link and earn rewards when friends join."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        {info && (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-[var(--color-border)] bg-black/20 px-3 py-2 text-xs">
                {info.link}
              </code>
              <Button type="button" variant="secondary" className="gap-2 shrink-0" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <p className="text-2xl font-bold text-white">{info.totalReferred}</p>
                <p className="text-xs text-muted">Friends invited</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <p className="text-2xl font-bold text-success">
                  ${info.totalEarnedUsdt.toFixed(2)}
                </p>
                <p className="text-xs text-muted">Earned so far</p>
              </div>
            </div>

            {info.referrals.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Users className="h-4 w-4" /> Your referrals
                </p>
                {info.referrals.map((r, i) => (
                  <div
                    key={`${r.displayName}-${i}`}
                    className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="text-foreground">{r.displayName}</p>
                      <p className="text-xs text-muted">
                        Joined {new Date(r.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge variant={r.kycCompleted ? "success" : "secondary"}>
                        {r.kycCompleted ? "KYC ✓" : "KYC pending"}
                      </Badge>
                      <Badge variant={r.subscribed ? "success" : "secondary"}>
                        {r.subscribed ? "Subscribed ✓" : "Not subscribed"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
