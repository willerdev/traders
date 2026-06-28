"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type ArchivedSetupItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Archive, Loader2, RefreshCw } from "lucide-react";

export function ArchivedSetupsCard() {
  const [items, setItems] = useState<ArchivedSetupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.signals.archived(30);
      setItems(res.items ?? []);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error ? err.message : "Could not load archived setups",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <Card className="lg:col-span-2 border-white/5">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-gray-400" />
            Archived Setups
          </CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Setups you archived or invalidated — hidden from open setups, not scored
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading archives…
          </div>
        ) : (
          <div className="space-y-2">
            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {items.map((setup) => (
              <div
                key={setup.id}
                className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{setup.symbol}</span>
                    <Badge
                      variant={setup.direction === "BUY" ? "success" : "danger"}
                    >
                      {setup.direction}
                    </Badge>
                    <Badge variant="secondary">{setup.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Entry {setup.entryMin} – {setup.entryMax} · TP {setup.takeProfit}{" "}
                    · SL {setup.stopLoss}
                  </p>
                  <p className="text-xs text-gray-600">
                    Submitted {new Date(setup.submittedAt).toLocaleString()}
                    {setup.resolvedAt && (
                      <>
                        {" · "}
                        Resolved {new Date(setup.resolvedAt).toLocaleString()}
                      </>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
