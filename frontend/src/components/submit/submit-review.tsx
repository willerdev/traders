"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { TradeExecutionNotice } from "@/components/trading/trade-execution-notice";

export type ReviewPayload = {
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: number;
  entryMax: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  description: string;
  screenshotUrl: string;
  previewUrl: string | null;
};

export function SubmitReviewCard({
  review,
  loading,
  error,
  onEdit,
  onConfirm,
}: {
  review: ReviewPayload;
  loading: boolean;
  error: string;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <CardTitle>Review your setup</CardTitle>
        </div>
        <CardDescription>
          Final check — then submit. Use “Edit setup” to go back and change direction or levels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-[var(--color-border)] bg-foreground/[0.02] p-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-foreground">{review.symbol}</span>
            <Badge variant={review.direction === "BUY" ? "success" : "danger"}>
              {review.direction}
            </Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Entry range</p>
              <p className="font-medium text-foreground">
                {review.entryMin} – {review.entryMax}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Risk / reward</p>
              <p className="font-medium text-primary">1:{review.riskRewardRatio}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Stop loss</p>
              <p className="font-medium text-foreground">{review.stopLoss}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Take profit</p>
              <p className="font-medium text-foreground">{review.takeProfit}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted">Trade analysis</p>
            <p className="mt-1 text-foreground whitespace-pre-wrap">{review.description}</p>
          </div>

          {review.previewUrl && (
            <div>
              <p className="mb-2 text-xs text-muted">Chart screenshot</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={review.previewUrl}
                alt="Setup preview"
                className="max-h-48 w-full rounded-lg border border-[var(--color-border)] object-contain bg-black/40"
              />
            </div>
          )}
        </div>

        <TradeExecutionNotice variant="submit" />

        <div className="flex items-start gap-2 rounded-lg border border-rank-gold/30 bg-rank-gold/5 p-3 text-xs text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rank-gold" />
          <span>
            After you confirm, this setup is submitted immutably for ranking and MT5
            execution. Double-check symbol, direction, and price levels.
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            className="gap-2 sm:flex-1"
            onClick={onEdit}
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4" />
            Edit direction & levels
          </Button>
          <Button
            type="button"
            className="gap-2 sm:flex-1"
            size="lg"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Submitting…" : "Confirm & submit"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
