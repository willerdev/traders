"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useThemeStore } from "@/stores/theme";
import { api } from "@/lib/api";
import { validateDisplayName } from "@/lib/display-name";
import { MetaApiTokenCard } from "@/components/mt5/metaapi-token-card";
import { MetaApiAccountPicker } from "@/components/mt5/metaapi-account-picker";
import { NowpaymentsPayoutLoginCard } from "@/components/wallet/nowpayments-payout-login-card";
import { canManageSoloTrades } from "@/lib/solo-admin";
import { SoloTraderRiskAdmin } from "@/components/settings/solo-trader-risk-admin";

export default function SettingsPage() {
  const { ready } = useRequireAuth();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const canManage = canManageSoloTrades(user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [derivMsg, setDerivMsg] = useState("");
  const [derivErr, setDerivErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [metaOk, setMetaOk] = useState(false);
  const [profileName, setProfileName] = useState(user?.displayName ?? "");
  const [tradingName, setTradingName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void api.deriv
      .status()
      .then((s) => {
        setConnected(s.connected);
        setMasked(s.tokenMasked);
      })
      .catch(() => undefined);
    void api.soloTraders
      .me()
      .then((me) => {
        setTradingName(me.tradeComment || me.defaultComment || "");
      })
      .catch(() => undefined);
  }, [ready]);

  useEffect(() => {
    if (user?.displayName) setProfileName(user.displayName);
  }, [user?.displayName]);

  async function saveNames(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameErr("");
    setNameMsg("");
    const nameError = validateDisplayName(profileName);
    if (nameError) {
      setNameErr(nameError);
      setSavingName(false);
      return;
    }
    try {
      const updated = await api.users.updateProfile({
        displayName: profileName.trim(),
      });
      const auth = useAuthStore.getState();
      if (auth.user && auth.token) {
        setAuth(auth.token, {
          ...auth.user,
          displayName: updated.user.displayName,
        });
      }
      setProfileName(updated.user.displayName);
      const nextTrading = tradingName.trim();
      if (nextTrading) {
        const me = await api.soloTraders.setComment(nextTrading);
        setTradingName(me.tradeComment || nextTrading);
      } else {
        const me = await api.soloTraders.me().catch(() => null);
        if (me) setTradingName(me.tradeComment || me.defaultComment || "");
      }
      setNameMsg("Name saved. New live trades will use your trading name.");
    } catch (err) {
      setNameErr(err instanceof Error ? err.message : "Could not save name");
    } finally {
      setSavingName(false);
    }
  }

  async function saveToken(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setDerivErr("");
    setDerivMsg("");
    try {
      const res = await api.deriv.saveToken(token.trim());
      setConnected(true);
      setMasked(res.tokenMasked);
      setToken("");
      setDerivMsg("Token saved. Open Deriv to see MT5 balances.");
    } catch (err) {
      setDerivErr(err instanceof Error ? err.message : "Could not save token");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    setDerivErr("");
    try {
      await api.deriv.disconnect();
      setConnected(false);
      setMasked(null);
      setDerivMsg("Disconnected.");
    } catch (err) {
      setDerivErr(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <AuthLoadingScreen />;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 xl:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">
          Account, MetaAPI, Deriv, and NOWPayments (Render env or Settings)
        </p>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <Card className="min-w-0 h-full">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>{user?.email ?? "Signed in"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-300">
            <p>
              Email:{" "}
              <span className="text-white">{user?.email ?? "—"}</span>
            </p>
            <form onSubmit={(e) => void saveNames(e)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="profileName">Profile name</Label>
                <Input
                  id="profileName"
                  value={profileName}
                  maxLength={40}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Name shown in the app"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tradingName">Trading name</Label>
                <Input
                  id="tradingName"
                  value={tradingName}
                  maxLength={31}
                  onChange={(e) => setTradingName(e.target.value)}
                  placeholder="Name stamped on live trades"
                />
                <p className="text-xs text-gray-500">
                  Profile name is what you see in the app. Trading name is the
                  comment on orders you open (letters, numbers, _ and -).
                </p>
              </div>
              {nameErr ? (
                <p className="text-sm text-danger">{nameErr}</p>
              ) : null}
              {nameMsg ? (
                <p className="text-sm text-success">{nameMsg}</p>
              ) : null}
              <Button type="submit" disabled={savingName}>
                {savingName ? "Saving…" : "Save names"}
              </Button>
            </form>
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => toggleTheme()}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          </CardContent>
        </Card>

        <Card className="min-w-0 h-full">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              We email a reset link. No KYC is required on Solo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button variant="secondary">Reset password</Button>
            </Link>
          </CardContent>
        </Card>

        <MetaApiTokenCard onChanged={setMetaOk} className="min-w-0 h-full" />

        {metaOk ? (
          <Card className="min-w-0 h-full">
            <CardHeader>
              <CardTitle>Monitor a MetaAPI account</CardTitle>
              <CardDescription>
                {canManage
                  ? "Paste the account ID from the top of the card in app.metaapi.cloud. You do not enter MT5 login or password."
                  : "You are watching the same MetaAPI account the admin connected."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetaApiAccountPicker enabled={metaOk} bare />
            </CardContent>
          </Card>
        ) : (
          <Card className="min-w-0 h-full">
            <CardHeader>
              <CardTitle>Monitor a MetaAPI account</CardTitle>
              <CardDescription>
                {canManage
                  ? "Save a MetaAPI token first, then paste the Cloud account UUID here to watch that terminal."
                  : "Waiting for the admin to connect MetaAPI. You will see the same live account once it is linked."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <NowpaymentsPayoutLoginCard />

        <Card className="min-w-0 h-full">
          <CardHeader>
            <CardTitle>Deriv / MT5</CardTitle>
            <CardDescription>
              On developers.deriv.com create a Native PAT app, put that App ID
              on solo-api as DERIV_APP_ID, then paste a PAT with Trade, Payments,
              and Account management. We never show the full token again after
              save.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connected && (
              <p className="text-sm text-success">
                {canManage
                  ? `Connected ${masked ? `(${masked})` : ""}`
                  : "Connected — live Deriv account shared from the admin"}
              </p>
            )}
            {canManage ? (
            <form onSubmit={saveToken} className="space-y-2">
              <Label htmlFor="deriv-token">API token</Label>
              <Input
                id="deriv-token"
                type="password"
                autoComplete="off"
                placeholder="Paste token"
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
                <Link href="/deriv">
                  <Button type="button" variant="ghost">
                    Open Deriv
                  </Button>
                </Link>
              </div>
            </form>
            ) : (
              <Link href="/deriv">
                <Button type="button" variant="ghost">
                  Open Deriv
                </Button>
              </Link>
            )}
            {derivMsg && <p className="text-sm text-success">{derivMsg}</p>}
            {derivErr && <p className="text-sm text-danger">{derivErr}</p>}
          </CardContent>
        </Card>
      </div>

      {user?.isSoloPlatformAdmin ? (
        <div className="mt-5">
          <SoloTraderRiskAdmin />
        </div>
      ) : null}

      <div className="mt-6">
        <Button
          variant="danger"
          className="gap-2"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
