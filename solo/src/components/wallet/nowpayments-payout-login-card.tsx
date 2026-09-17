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
      });
      setMasked(s.payoutEmailMasked);
      setPasswordSet(s.payoutPasswordSet);
      setReady(s.payoutConfigured);
      setApiKeySet(s.apiKeySet);
      setPassword("");
      setNotice("Payout username and password saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>NOWPayments payout login</CardTitle>
        <CardDescription>
          Save the NOWPayments username (email) and password used to send
          withdrawals. The API key stays on the server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        ) : (
          <form onSubmit={(e) => void save(e)} className="space-y-3">
            <p className="text-xs text-muted">
              API key {apiKeySet ? "is set on the server" : "is missing on solo-api"}
              {" · "}
              {ready ? "payout login ready" : "payout login not saved yet"}
              {masked ? ` (${masked})` : ""}
              {passwordSet ? " · password saved" : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="np-email">Payout username</Label>
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
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
