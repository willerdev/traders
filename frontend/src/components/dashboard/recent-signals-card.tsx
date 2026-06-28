"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { SignalRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SetupDetailModal,
  type SetupSummary,
} from "@/components/dashboard/setup-detail-modal";

type Props = {
  signals: SignalRecord[];
  onRefresh: () => void;
};

function toSummary(signal: SignalRecord): SetupSummary {
  return {
    signalId: signal.signalId,
    symbol: signal.symbol,
    direction: signal.direction,
    entryMin: Number(signal.entryMin),
    entryMax: Number(signal.entryMax),
    stopLoss: Number(signal.stopLoss),
    takeProfit: Number(signal.takeProfit),
    status: signal.status,
    submittedAt: signal.submittedAt,
    screenshotUrl: signal.screenshotUrl,
  };
}

export function RecentSignalsCard({ signals, onRefresh }: Props) {
  const [selected, setSelected] = useState<SetupSummary | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recent Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-500">No signals submitted yet</p>
              <Link href="/submit" className="mt-4 inline-block">
                <Button variant="secondary" size="sm" className="gap-2">
                  Submit your first signal
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((signal) => (
                <button
                  key={signal.id}
                  type="button"
                  onClick={() => setSelected(toSummary(signal))}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border border-white/5",
                    "bg-white/[0.02] p-3 text-left transition-colors",
                    "hover:border-primary/30 hover:bg-primary/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{signal.symbol}</span>
                      <Badge
                        variant={signal.direction === "BUY" ? "success" : "danger"}
                      >
                        {signal.direction}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Entry: {Number(signal.entryMin)} – {Number(signal.entryMax)}
                      {" · "}
                      {new Date(signal.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{signal.status}</Badge>
                    <ChevronRight className="h-4 w-4 text-gray-600" />
                  </div>
                </button>
              ))}
              <p className="pt-1 text-center text-xs text-gray-600">
                Click a setup to view progress, claim TP, or invalidate
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <SetupDetailModal
          setup={selected}
          onClose={() => setSelected(null)}
          onUpdated={onRefresh}
        />
      )}
    </>
  );
}
