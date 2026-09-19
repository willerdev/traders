"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { canManageSoloTrades } from "@/lib/solo-admin";

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
  const canManage = canManageSoloTrades(useAuthStore((s) => s.user));
  const [token, setToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

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
  }, [enabled]);

  if (!enabled) return null;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const id = accountId.replace(/\s+/g, "").trim();
    if (!id) return;
    setLinking(true);
    setErr("");
    setMsg("");
    try {
      const res = await api.metaApi.linkAccount(
        id,
        showTokenField ? token : undefined,
      );
      setSelectedId(res.accountId);
      setToken("");
      setTokenSaved(true);
      setMsg(
        `Monitoring ${res.account.name || res.account.login} (${res.accountId}).`,
      );
      onLinked?.();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setLinking(false);
    }
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
          Paste the account ID from the top of the card in app.metaapi.cloud.
          You do not enter MT5 login or password.
        </p>
      </div>
      )}

      {canManage && showTokenField && (
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

      {canManage ? (
      <div className="space-y-1.5">
        <Label htmlFor="metaapi-account-id">MetaAPI account ID</Label>
        <Input
          id="metaapi-account-id"
          autoComplete="off"
          placeholder="e0728359-7b47-427f-8771-cbf33ad733da"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          required
        />
      </div>
      ) : null}

      {selectedId && (
        <p className="font-mono text-xs text-success">Watching {selectedId}</p>
      )}

      {canManage ? (
      <Button
        type="submit"
        disabled={linking || !accountId.trim() || (needToken && !token.trim())}
      >
        {linking ? "Connecting…" : "Monitor this account"}
      </Button>
      ) : (
        <p className="text-xs text-muted">
          Shared live account — only the admin can change which MetaAPI account
          is monitored.
        </p>
      )}

      {msg && <p className="text-sm text-success">{msg}</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
    </form>
  );
}
