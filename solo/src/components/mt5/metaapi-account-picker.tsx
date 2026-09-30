"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

type CloudAccount = {
  id: string;
  login: string;
  name: string;
  server: string;
  state: string;
  connectionStatus: string;
  selected: boolean;
};

function accountLabel(row: CloudAccount) {
  const title = row.name || row.login || row.id.slice(0, 8);
  const extra = [row.login && row.name ? row.login : null, row.server]
    .filter(Boolean)
    .join(" · ");
  return extra ? `${title} · ${extra}` : title;
}

type Props = {
  enabled?: boolean;
  showTokenField?: boolean;
  onLinked?: () => void;
  bare?: boolean;
};

export function MetaApiAccountPicker({
  enabled = true,
  showTokenField = false,
  onLinked,
  bare = false,
}: Props) {
  const isAdmin = Boolean(
    useAuthStore((s) => s.user?.isSoloPlatformAdmin),
  );
  const [token, setToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoadingList(true);
    try {
      const listed = await api.metaApi.accounts();
      setAccounts(listed.items);
      const current = listed.selectedId ?? listed.items.find((a) => a.selected)?.id ?? null;
      setSelectedId(current);
      if (current) setAccountId(current);
    } catch {
      setAccounts([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void api.metaApi
      .status()
      .then((s) => {
        setTokenSaved(s.connected);
        setSelectedId(s.accountId);
        if (s.accountId) setAccountId(s.accountId);
      })
      .catch(() => undefined);
    void loadAccounts();
  }, [enabled, loadAccounts]);

  if (!enabled) return null;

  async function monitor(id: string) {
    const next = id.replace(/\s+/g, "").trim();
    if (!next) return;
    setLinking(true);
    setErr("");
    setMsg("");
    try {
      const res = await api.metaApi.linkAccount(
        next,
        showTokenField ? token : undefined,
      );
      setSelectedId(res.accountId);
      setAccountId(res.accountId);
      setToken("");
      setTokenSaved(true);
      setMsg(
        `Monitoring ${res.account.name || res.account.login} (${res.accountId}).`,
      );
      await loadAccounts();
      onLinked?.();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setLinking(false);
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    await monitor(accountId);
  }

  const needToken = showTokenField && !tokenSaved;

  return (
    <form
      onSubmit={connect}
      className={
        bare
          ? "space-y-3"
          : "space-y-3 rounded-lg border border-[var(--color-border)] bg-card px-3 py-3"
      }
    >
      {!bare && (
      <div>
        <p className="text-sm font-medium text-white">Monitor a MetaAPI account</p>
        <p className="mt-1 text-xs text-muted">
          Choose which connected account this admin session watches. That
          account is also the default for users without a specific assignment.
        </p>
      </div>
      )}

      {isAdmin && showTokenField && (
        <div className="space-y-1.5">
          <Label htmlFor="metaapi-token-connect">
            MetaAPI API token {tokenSaved ? "(already saved)" : ""}
          </Label>
          <Input
            id="metaapi-token-connect"
            type="password"
            autoComplete="off"
            placeholder={
              tokenSaved
                ? "Leave blank to keep saved token"
                : "Paste API token from app.metaapi.cloud"
            }
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required={needToken}
          />
        </div>
      )}

      {isAdmin ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="metaapi-account-select">Account to monitor</Label>
            {loadingList && accounts.length === 0 ? (
              <p className="text-xs text-muted">Loading connected accounts…</p>
            ) : accounts.length > 0 ? (
              <select
                id="metaapi-account-select"
                className="h-10 w-full rounded-md border border-[var(--color-border)] bg-card px-2 text-sm text-white"
                value={
                  accounts.some((a) => a.id === accountId) ? accountId : ""
                }
                disabled={linking || (needToken && !token.trim())}
                onChange={(e) => {
                  const id = e.target.value;
                  setAccountId(id);
                  if (id) void monitor(id);
                }}
              >
                <option value="">Select an account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                    {a.selected || a.id === selectedId ? " · watching" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted">
                No accounts on this token yet. Add them in app.metaapi.cloud,
                then refresh.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaapi-account-id">Or paste a MetaAPI account ID</Label>
            <Input
              id="metaapi-account-id"
              autoComplete="off"
              placeholder="e0728359-7b47-427f-8771-cbf33ad733da"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </div>
        </>
      ) : null}

      {selectedId && (
        <p className="font-mono text-xs text-success">Watching {selectedId}</p>
      )}

      {isAdmin ? (
      <Button
        type="submit"
        disabled={linking || !accountId.trim() || (needToken && !token.trim())}
      >
        {linking ? "Connecting…" : "Monitor this account"}
      </Button>
      ) : (
        <p className="text-xs text-muted">
          Shared live account — the admin chooses which MetaAPI account you see.
        </p>
      )}

      {msg && <p className="text-sm text-success">{msg}</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
    </form>
  );
}
