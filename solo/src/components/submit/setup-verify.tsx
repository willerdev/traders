"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { setupValidationError } from "@/lib/chart-setup";

type VerifyForm = {
  symbol: string;
  direction: "BUY" | "SELL";
  entryMin: string;
  entryMax: string;
  stopLoss: string;
  takeProfit: string;
};

export function SetupVerifyCard({
  form,
  aiSuggestedDirection,
  previewUrl,
  error,
  onFormChange,
  onBack,
  onConfirm,
}: {
  form: VerifyForm;
  aiSuggestedDirection: "BUY" | "SELL" | null;
  previewUrl: string | null;
  error: string;
  onFormChange: (patch: Partial<VerifyForm>) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const entryMin = parseFloat(form.entryMin);
  const entryMax = parseFloat(form.entryMax);
  const stopLoss = parseFloat(form.stopLoss);
  const takeProfit = parseFloat(form.takeProfit);

  const levelsReady =
    Number.isFinite(entryMin) &&
    Number.isFinite(entryMax) &&
    Number.isFinite(stopLoss) &&
    Number.isFinite(takeProfit);

  const validationErr = levelsReady
    ? setupValidationError({
        direction: form.direction,
        entryMin,
        entryMax,
        stopLoss,
        takeProfit,
      })
    : "Enter valid numbers for entry, stop loss, and take profit";

  const directionChangedByUser =
    aiSuggestedDirection !== null && aiSuggestedDirection !== form.direction;

  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-400" />
          <CardTitle>Confirm trade levels</CardTitle>
        </div>
        <CardDescription>
          AI can misread chart direction. Check and fix direction, entry, stop loss,
          and take profit before you continue — your choices here are what get sent to MT5.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {aiSuggestedDirection && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted">
              AI suggested{" "}
              <Badge
                variant={aiSuggestedDirection === "BUY" ? "success" : "danger"}
                className="mx-1"
              >
                {aiSuggestedDirection}
              </Badge>
              {directionChangedByUser
                ? " — you changed it to "
                : ". Change it below if the chart shows the opposite."}
              {directionChangedByUser && (
                <Badge
                  variant={form.direction === "BUY" ? "success" : "danger"}
                  className="mx-1"
                >
                  {form.direction}
                </Badge>
              )}
              {directionChangedByUser
                ? ". That is what will be submitted."
                : null}
            </span>
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-border)] bg-foreground/[0.02] p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-foreground">{form.symbol || "—"}</span>
          </div>

          <div className="space-y-2">
            <Label>Direction — required</Label>
            <div className="flex gap-2">
              {(["BUY", "SELL"] as const).map((dir) => (
                <Button
                  key={dir}
                  type="button"
                  variant={form.direction === dir ? "default" : "secondary"}
                  className="flex-1"
                  onClick={() => {
                    setConfirmed(false);
                    onFormChange({ direction: dir });
                  }}
                >
                  {dir}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="verify-entry-min">Entry min</Label>
              <Input
                id="verify-entry-min"
                type="number"
                step="any"
                value={form.entryMin}
                onChange={(e) => {
                  setConfirmed(false);
                  onFormChange({ entryMin: e.target.value });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="verify-entry-max">Entry max</Label>
              <Input
                id="verify-entry-max"
                type="number"
                step="any"
                value={form.entryMax}
                onChange={(e) => {
                  setConfirmed(false);
                  onFormChange({ entryMax: e.target.value });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="verify-sl">Stop loss</Label>
              <Input
                id="verify-sl"
                type="number"
                step="any"
                value={form.stopLoss}
                onChange={(e) => {
                  setConfirmed(false);
                  onFormChange({ stopLoss: e.target.value });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="verify-tp">Take profit</Label>
              <Input
                id="verify-tp"
                type="number"
                step="any"
                value={form.takeProfit}
                onChange={(e) => {
                  setConfirmed(false);
                  onFormChange({ takeProfit: e.target.value });
                }}
              />
            </div>
          </div>

          {levelsReady && validationErr && (
            <p className="text-sm text-danger">{validationErr}</p>
          )}
          {levelsReady && !validationErr && (
            <p className="text-sm text-success">
              Levels match a {form.direction} setup — SL and TP are on the correct side.
            </p>
          )}
        </div>

        {previewUrl && (
          <div>
            <p className="mb-2 text-xs text-muted">Chart screenshot</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Setup preview"
              className="max-h-48 w-full rounded-lg border border-[var(--color-border)] object-contain bg-black/40"
            />
          </div>
        )}

        <label className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] p-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 rounded border-[var(--color-border)]"
          />
          <span className="text-muted">
            I confirm this <strong className="text-foreground">{form.direction}</strong>{" "}
            setup with the entry, stop loss, and take profit shown above is correct.
          </span>
        </label>

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
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to form
          </Button>
          <Button
            type="button"
            className="gap-2 sm:flex-1"
            size="lg"
            disabled={!confirmed || Boolean(validationErr) || !levelsReady}
            onClick={onConfirm}
          >
            Continue to final review
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
