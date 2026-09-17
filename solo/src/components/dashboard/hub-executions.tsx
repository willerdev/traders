"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type HubSignalStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { History, Loader2, RefreshCw } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "executed", label: "Executed" },
  { value: "invalidated", label: "Invalidated" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
];

function statusVariant(status: string): "success" | "danger" | "secondary" {
  const s = status.toLowerCase();
  if (s === "executed" || s === "filled") return "success";
  if (s === "failed" || s === "invalidated") return "danger";
  return "secondary";
}

export function HubExecutionsCard() {
  const [items, setItems] = useState<HubSignalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [since, setSince] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.signals.hubList({
        limit: 25,
        ...(status ? { status } : {}),
        ...(since ? { since: new Date(since).toISOString() } : {}),
      });
      setItems(res.items ?? []);
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error ? err.message : "Could not load execution history",
      );
    } finally {
      setLoading(false);
    }
  }, [status, since]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="lg:col-span-2 border-white/5">
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Signal Hub History
          </CardTitle>
          <p className="mt-1 text-sm text-gray-500">
            Recent MT5 execution queue entries for your account
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-1 shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="hub-status" className="text-xs text-gray-500">
              Status
            </Label>
            <select
              id="hub-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-9 w-full min-w-[140px] rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hub-since" className="text-xs text-gray-500">
              Since
            </Label>
            <Input
              id="hub-since"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading history…
          </div>
        ) : error && items.length === 0 ? (
          <div className="rounded-lg border border-white/5 py-8 text-center text-sm text-gray-400">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-gray-500">
            No execution records match your filters
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                  {item.duplicate && (
                    <Badge variant="secondary">duplicate</Badge>
                  )}
                  {item.external_id && (
                    <span className="text-xs text-gray-500">
                      Setup {item.external_id.slice(0, 12)}…
                    </span>
                  )}
                </div>
                {item.progress?.message && (
                  <p className="mt-2 text-sm text-gray-400">
                    {item.progress.message}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-600">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleString()
                    : "—"}
                  {item.progress?.stage && (
                    <>
                      {" · "}
                      Stage: {item.progress.stage}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
