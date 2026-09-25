"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type SoloTraderSnapshot } from "@/lib/api";

export function SoloTraderRiskAdmin() {
  const [traders, setTraders] = useState<SoloTraderSnapshot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const res = await api.soloTraders.list();
      setTraders(res.traders);
      setDrafts(
        Object.fromEntries(
          res.traders.map((t) => [t.userId, String(t.maxRiskPercent)]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load traders");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function resetLock(userId: string) {
    setSaving(userId);
    setError("");
    try {
      const updated = await api.soloTraders.resetDailyLoss(userId);
      setTraders((prev) =>
        prev.map((t) => (t.userId === userId ? updated : t)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset lock");
    } finally {
      setSaving(null);
    }
  }

  async function save(userId: string) {
    const n = Number(drafts[userId]);
    setSaving(userId);
    setError("");
    try {
      const updated = await api.soloTraders.setRisk(userId, n);
      setTraders((prev) =>
        prev.map((t) => (t.userId === userId ? updated : t)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save risk");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>Trader risk caps</CardTitle>
        <CardDescription>
          Max percent of live equity each operator may risk per order. Daily
          loss is capped at $200 — after that they cannot open new trades until
          you reset.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {traders.length === 0 ? (
          <p className="text-sm text-muted">No trade operators yet.</p>
        ) : (
          <ul className="space-y-4">
            {traders.map((t) => (
              <li
                key={t.userId}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{t.displayName}</p>
                    <p className="text-xs text-muted">{t.email}</p>
                    <p className="mt-1 text-xs tabular-nums text-gray-300">
                      Realized {t.realizedPnl.toFixed(2)} USDT · today{" "}
                      {(t.dailyPnl ?? 0).toFixed(2)} / -{t.dailyLossLimit ?? 200}{" "}
                      USDT
                      {t.dailyLossLocked ? " · LOCKED" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    {t.dailyLossLocked ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={saving === t.userId}
                        onClick={() => void resetLock(t.userId)}
                      >
                        Reset daily lock
                      </Button>
                    ) : null}
                    <div>
                      <Label htmlFor={`risk-${t.userId}`}>Max risk %</Label>
                      <Input
                        id={`risk-${t.userId}`}
                        type="number"
                        min={0.01}
                        max={100}
                        step={0.1}
                        className="mt-1 w-28"
                        value={drafts[t.userId] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [t.userId]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving === t.userId}
                      onClick={() => void save(t.userId)}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
