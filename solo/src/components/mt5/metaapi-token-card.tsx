"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { canManageSoloTrades } from "@/lib/solo-admin";

type Props = {
  compact?: boolean;
  onChanged?: (connected: boolean) => void;
  className?: string;
};

export function MetaApiTokenCard({ compact = false, onChanged, className }: Props) {
  const canManage = canManageSoloTrades(useAuthStore((s) => s.user));
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [shared, setShared] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.metaApi
      .status()
      .then((s) => {
        setConnected(s.connected);
        setShared(Boolean(s.shared));
        setMasked(s.tokenMasked);
        onChanged?.(s.connected);
      })
      .catch(() => undefined);
  }, [onChanged]);

  async function saveToken(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await api.metaApi.saveToken(token.trim());
      setConnected(true);
      setMasked(res.tokenMasked);
      setToken("");
      setMsg("Token saved. Paste the MetaAPI account ID below to monitor it.");
      onChanged?.(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save token");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    setErr("");
    try {
      await api.metaApi.disconnect();
      setConnected(false);
      setMasked(null);
      setMsg("Disconnected. Charts will not load until you paste a token again.");
      onChanged?.(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <div className="space-y-3">
      {connected && (
        <p className="text-sm text-success">
          {shared && !canManage
            ? "Connected — live account shared from the admin"
            : `Connected ${masked ? `(${masked})` : ""}`}
        </p>
      )}
      {canManage ? (
      <form onSubmit={saveToken} className="space-y-2">
        <Label htmlFor="metaapi-token">MetaAPI API token</Label>
        <Input
          id="metaapi-token"
          type="password"
          autoComplete="off"
          placeholder="Paste token from app.metaapi.cloud"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save token"}
          </Button>
              {connected && (
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => void disconnect()}
            >
              Disconnect
            </Button>
          )}
          {!compact && (
            <Link href="/mt5">
              <Button type="button" variant="ghost">
                Open charts
              </Button>
            </Link>
          )}
        </div>
      </form>
      ) : (
        <Link href="/mt5">
          <Button type="button" variant="ghost">
            Open charts
          </Button>
        </Link>
      )}
      {msg && <p className="text-sm text-success">{msg}</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );

  if (compact) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-card px-3 py-3">
        <p className="mb-2 text-sm font-medium text-white">MetaAPI Cloud</p>
        <p className="mb-3 text-xs text-muted">
          Sign in at app.metaapi.cloud, copy your API token, and paste it here.
          We store it encrypted for your user only — it is not set on Render.
        </p>
        {body}
      </div>
    );
  }

  return (
    <Card className={cn("h-full min-w-0", className)}>
      <CardHeader>
        <CardTitle>MetaAPI</CardTitle>
        <CardDescription>
          {canManage
            ? "Sign in at app.metaapi.cloud, copy your API token, then paste the account ID from the account card (the UUID at the top). You do not enter MT5 login or password."
            : "You see the same live MetaAPI account the admin connected. Only the admin can change the token or close trades."}
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
