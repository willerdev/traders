"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Target } from "lucide-react";
import type { PayoutRewardStatus } from "@/lib/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  reward: PayoutRewardStatus;
  compact?: boolean;
};

export function PayoutRewardTiersCard({ reward, compact }: Props) {
  const activeId = reward.currentTierId;

  return (
    <Card className={cn(!compact && "border-primary/20 bg-primary/5")}>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-rank-gold" />
              <CardTitle className="text-lg">Payout reward tiers</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Weekly USDT rewards based on your last {reward.windowSize} resolved setups
            </CardDescription>
          </div>
          <Badge variant="gold" className="shrink-0">
            You: ${reward.currentRewardUsdt} USDT
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Target className="h-4 w-4 text-primary" />
            <strong className="text-foreground">{reward.wins}</strong> wins /{" "}
            {reward.windowSize} setups
          </span>
          {reward.recentResults.length > 0 && (
            <span className="font-mono text-xs tracking-wider text-gray-500">
              {reward.recentResults.join(" ")}
            </span>
          )}
          {reward.nextTierId && reward.winsToNextTier > 0 && (
            <span className="text-xs text-gray-400">
              {reward.winsToNextTier} more win{reward.winsToNextTier === 1 ? "" : "s"} for{" "}
              {reward.nextTierId === "PRO" ? "$50 Pro" : "$100 Elite"}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {reward.tiers.map((tier) => {
            const active = tier.id === activeId;
            return (
              <div
                key={tier.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  active
                    ? "border-rank-gold/50 bg-rank-gold/10 ring-1 ring-rank-gold/30"
                    : "border-white/10 bg-white/[0.02]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{tier.label}</p>
                  {active && (
                    <Badge variant="gold" className="text-[10px]">
                      Current
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold text-success">
                  ${tier.amountUsdt}
                  <span className="ml-1 text-sm font-normal text-gray-400">USDT</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">{tier.requirement}</p>
              </div>
            );
          })}
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
            <p className="text-xs text-gray-500">
              Paid weekly when you have profitable activity. Complete KYC and add payout details
              to withdraw.
            </p>
            <Link href="/payouts">
              <Button size="sm" variant="secondary">
                Go to payouts
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
