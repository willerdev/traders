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
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function NowpaymentsPayoutLoginCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [masked, setMasked] = useState<string | null>(null);
  const [passwordSet, setPasswordSet] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void api.wallet
      .nowpaymentsPayoutLogin()
      .then((s) => {
        setApiKeySet(s.apiKeySet);
        setMasked(s.payoutEmailMasked);
        setPasswordSet(s.payoutPasswordSet);
        setReady(s.payoutConfigured);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const s = await api.wallet.saveNowpaymentsPayoutLogin({
        email: email.trim(),
        password: password.trim(),
        apiKey: apiKey.trim() || undefined,
      });
      setMasked(s.payoutEmailMasked);
      setPasswordSet(s.payoutPasswordSet);
      setReady(s.payoutConfigured);
      setApiKeySet(s.apiKeySet);
      setPassword("");
      setApiKey("");
      setNotice(
        "Saved. Both of you deposit and withdraw through this same NOWPayments account.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>NOWPayments (shared)</CardTitle>
        <CardDescription>
          One NOWPayments merchant for both of you. Deposits create invoices
          with this API key; withdrawals send USDT from the same account.
          Either of you can save the credentials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        ) : (
          <form onSubmit={(e) => void save(e)} className="space-y-3">
            <p className="text-xs text-muted">
              API key {apiKeySet ? "is set" : "is missing"} · payout login{" "}
              {ready ? "ready" : "not saved yet"}
              {masked ? ` (${masked})` : ""}
              {passwordSet ? " · password saved" : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="np-apikey">API key</Label>
              <Input
                id="np-apikey"
                type="password"
                autoComplete="off"
                placeholder={
                  apiKeySet
                    ? "Leave blank to keep the current key"
                    : "NOWPayments API key"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required={!apiKeySet}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="np-email">Payout email / username</Label>
              <Input
                id="np-email"
                type="email"
                autoComplete="off"
                placeholder="NOWPayments account email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="np-password">Payout password</Label>
              <Input
                id="np-password"
                type="password"
                autoComplete="new-password"
                placeholder="NOWPayments account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            {notice && <p className="text-sm text-success">{notice}</p>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save for both users"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
