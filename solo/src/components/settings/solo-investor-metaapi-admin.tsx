"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type MetaApiViewerAssignments } from "@/lib/api";

function accountLabel(
  accounts: MetaApiViewerAssignments["accounts"],
  id: string | null,
) {
  if (!id) return "Default platform account";
  const row = accounts.find((a) => a.id === id);
  if (!row) return id.slice(0, 8) + "…";
  const title = row.name || row.login || id.slice(0, 8);
  return `${title}${row.login && row.name ? ` · ${row.login}` : ""}`;
}

export function SoloInvestorMetaApiAdmin() {
  const [data, setData] = useState<MetaApiViewerAssignments | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function apply(next: MetaApiViewerAssignments) {
    setData(next);
    setDrafts(
      Object.fromEntries(
        next.viewers.map((v) => [v.userId, v.assignedAccountId ?? ""]),
      ),
    );
  }

  async function load() {
    setError("");
    try {
      const res = await api.metaApi.viewerAssignments();
      await apply(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load MetaAPI accounts",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(userId: string) {
    setSaving(userId);
    setError("");
    try {
      const raw = drafts[userId] ?? "";
      const next = await api.metaApi.assignViewerAccount(
        userId,
        raw.trim() ? raw.trim() : null,
      );
      await apply(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assignment");
    } finally {
      setSaving(null);
    }
  }

  const accounts = data?.accounts ?? [];

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>Investor MetaAPI accounts</CardTitle>
        <CardDescription>
          Connect several accounts on the same MetaAPI token, then pick which
          live book each user sees. Leave Default to use{" "}
          {data?.defaultAccountId
            ? accountLabel(accounts, data.defaultAccountId)
            : "the account you monitor above"}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">
            Save a MetaAPI token and monitor at least one account, then
            refresh this page.
          </p>
        ) : null}
        {!data ? (
          <p className="text-sm text-muted">Loading users…</p>
        ) : (
          <ul className="space-y-3">
            {data.viewers.map((v) => (
              <li
                key={v.userId}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{v.displayName}</p>
                    <p className="text-xs text-muted">{v.email}</p>
                    <p className="mt-1 text-xs text-gray-300">
                      {v.investorActive ? "Investor" : "User"}
                      {v.soloTradeOperator ? " · trader" : ""}
                      {v.assignedAccountId
                        ? " · assigned"
                        : " · using default"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <Label htmlFor={`mt5-acc-${v.userId}`}>Account they see</Label>
                      <select
                        id={`mt5-acc-${v.userId}`}
                        className="mt-1 h-10 min-w-[220px] rounded-md border border-[var(--color-border)] bg-card px-2 text-sm text-white"
                        value={drafts[v.userId] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [v.userId]: e.target.value,
                          }))
                        }
                      >
                        <option value="">
                          Default
                          {data.defaultAccountId
                            ? ` (${accountLabel(accounts, data.defaultAccountId)})`
                            : ""}
                        </option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {accountLabel(accounts, a.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving === v.userId}
                      onClick={() => void save(v.userId)}
                    >
                      {saving === v.userId ? "Saving…" : "Save"}
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
