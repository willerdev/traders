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
import { api, type NowpaymentsPayoutStatus } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { canManageSoloTrades } from "@/lib/solo-admin";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function sideLabel(side?: {
  apiKeySet: boolean;
  publicKeySet: boolean;
  payoutEmailSet: boolean;
  payoutPasswordSet: boolean;
  payoutEmailMasked?: string | null;
}) {
  if (!side) return "not loaded";
  const parts = [
    side.apiKeySet ? "API key" : null,
    side.publicKeySet ? "public key" : null,
    side.payoutEmailSet ? `email${side.payoutEmailMasked ? ` ${side.payoutEmailMasked}` : ""}` : null,
    side.payoutPasswordSet ? "password" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "nothing saved";
}

export function NowpaymentsPayoutLoginCard() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = canManageSoloTrades(user);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [status, setStatus] = useState<NowpaymentsPayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function applyStatus(s: NowpaymentsPayoutStatus) {
    setStatus(s);
  }

  useEffect(() => {
    void api.wallet
      .nowpaymentsPayoutLogin()
      .then(applyStatus)
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
        publicKey: publicKey.trim() || undefined,
      });
      applyStatus(s);
      setPassword("");
      setApiKey("");
      setPublicKey("");
      setNotice(
        s.source === "settings"
          ? "Settings credentials saved and currently in use."
          : "Settings credentials saved. Switch the source to Settings to use them.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function switchSource(source: "env" | "settings") {
    setSwitching(true);
    setError("");
    setNotice("");
    try {
      const s = await api.wallet.setNowpaymentsPayoutSource(source);
      applyStatus(s);
      setNotice(
        source === "env"
          ? "Using Render environment NOWPayments keys."
          : "Using Settings NOWPayments credentials.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch source");
    } finally {
      setSwitching(false);
    }
  }

  const source = status?.source ?? "env";

  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>NOWPayments credentials</CardTitle>
        <CardDescription>
          Deposits and withdrawals use one merchant: either the Render env
          defaults, or the login and keys saved here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border bg-navy/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Active source
              </p>
              <p className="text-sm text-foreground">
                {source === "env" ? "Render environment" : "Settings credentials"}
                {status?.payoutConfigured ? " · ready" : " · not complete"}
              </p>
              {isAdmin ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={switching || source === "env"}
                    onClick={() => void switchSource("env")}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm",
                      source === "env"
                        ? "border-primary bg-primary/15 font-semibold text-primary"
                        : "border-border text-foreground/80 hover:bg-navy/60",
                    )}
                  >
                    Render env
                    <span className="mt-1 block text-[11px] font-normal text-muted">
                      {sideLabel(status?.env)}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={switching || source === "settings"}
                    onClick={() => void switchSource("settings")}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm",
                      source === "settings"
                        ? "border-primary bg-primary/15 font-semibold text-primary"
                        : "border-border text-foreground/80 hover:bg-navy/60",
                    )}
                  >
                    Settings
                    <span className="mt-1 block text-[11px] font-normal text-muted">
                      {sideLabel(status?.settings)}
                    </span>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Only the soloEmma admin can switch between Render env and
                  Settings. You can still save credentials below.
                </p>
              )}
            </div>

            <form onSubmit={(e) => void save(e)} className="space-y-3">
              <p className="text-xs text-muted">
                Saved in Settings (not used until the admin picks Settings):{" "}
                {sideLabel(status?.settings)}
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
                <div className="space-y-1">
                  <Label htmlFor="np-api-key">API key</Label>
                  <Input
                    id="np-api-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      status?.settings?.apiKeySet
                        ? "Saved — paste to replace"
                        : "NOWPayments API key"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-public-key">Public key</Label>
                  <Input
                    id="np-public-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      status?.settings?.publicKeySet
                        ? "Saved — paste to replace"
                        : "NOWPayments public key"
                    }
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              {notice && <p className="text-sm text-success">{notice}</p>}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Settings credentials"}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
