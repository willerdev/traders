"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Mt5ConnectCredentials = {
  accountName: string;
  login: string;
  password: string;
  server: string;
};

type Props = {
  submitting?: boolean;
  compact?: boolean;
  onSubmit: (credentials: Mt5ConnectCredentials) => void | Promise<void>;
};

export function Mt5ConnectForm({ submitting = false, compact = false, onSubmit }: Props) {
  const [accountName, setAccountName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void onSubmit({
      accountName: accountName.trim(),
      login: login.trim(),
      password,
      server: server.trim(),
    });
  }

  const fieldClass = compact ? "space-y-1.5" : "space-y-2";

  return (
    <form onSubmit={handleSubmit} className={compact ? "space-y-2" : "space-y-3"}>
      <p className={compact ? "text-xs text-muted" : "text-sm text-muted"}>
        Enter your MT5 credentials. We will add your account to MetaAPI and link it
        for Live Sync.
      </p>
      <div className={fieldClass}>
        <Label htmlFor="mt5-account-name">Account name</Label>
        <Input
          id="mt5-account-name"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="My MT5 account"
          disabled={submitting}
          required
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor="mt5-login">MetaTrader login</Label>
        <Input
          id="mt5-login"
          inputMode="numeric"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="12345678"
          disabled={submitting}
          required
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor="mt5-password">MetaTrader password</Label>
        <Input
          id="mt5-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Trading or investor password"
          disabled={submitting}
          required
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor="mt5-server">MetaTrader server</Label>
        <Input
          id="mt5-server"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="BrokerName-Live"
          disabled={submitting}
          required
        />
      </div>
      <Button type="submit" size={compact ? "sm" : "default"} disabled={submitting} className={compact ? "w-full" : undefined}>
        {submitting ? "Connecting…" : "Connect MT5 account"}
      </Button>
    </form>
  );
}
