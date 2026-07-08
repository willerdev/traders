"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type DailyIncomeEntry } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function DailyIncomeJournal({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<DailyIncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.wallet
      .incomeJournal(compact ? 10 : 30)
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }, [compact]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily income journal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No daily earnings yet.</p>
        ) : (
          items.map((entry) => (
            <div
              key={`${entry.source}-${entry.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-white">
                  {entry.source === "INVESTOR" ? "Investor" : "Depositor"}
                  {entry.dayIndex != null ? ` · day ${entry.dayIndex}` : ""}
                  {" · "}
                  {entry.yieldPercent}%
                </p>
                <p className="text-[10px] text-gray-500">
                  {entry.creditDate} · base {formatCurrency(entry.baseBalance)}
                </p>
              </div>
              <span className="text-sm font-bold text-success">
                +{formatCurrency(entry.amount)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
