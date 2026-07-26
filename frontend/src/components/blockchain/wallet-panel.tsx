"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBlockchain } from "@/hooks/use-blockchain";
import type { WalletState } from "@/lib/blockchain/types";
import { TxLifecycleProgress } from "./tx-lifecycle-progress";
import {
  AnimatedCounter,
  Countdown,
  GlassCard,
  shortAddr,
  Skeleton,
  StatusDot,
  TxStatusBadge,
} from "./ui-kit";

export function WalletPanel({
  wallet,
  loading,
}: {
  wallet: WalletState | null;
  loading: boolean;
}) {
  const {
    connect,
    disconnect,
    deposit,
    withdraw,
    claim,
    compound,
    refresh,
    action,
    txProgress,
    contractConfigured,
  } = useBlockchain();
  const [amount, setAmount] = useState("1");
  const contractReady = contractConfigured;

  if (loading || !wallet) {
    return <Skeleton className="h-80" />;
  }

  const amt = Number(amount) || 0;

  return (
    <GlassCard
      title="Wallet Panel"
      action={<TxStatusBadge status={action.status === "idle" ? "success" : action.status} />}
      className="h-full"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <StatusDot
          tone={wallet.connected ? "success" : "muted"}
          label={wallet.connected ? "Wallet Connected" : "Wallet Not Connected"}
        />
        <span className="text-xs text-muted">
          {wallet.provider ? `via ${wallet.provider}` : "MetaMask · WalletConnect · Coinbase ready"}
        </span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Wallet Address" value={shortAddr(wallet.address, 6)} mono />
        <Field
          label="Wallet Balance"
          value={
            <>
              <AnimatedCounter value={wallet.balance} /> BNB
            </>
          }
        />
        <Field
          label="Investment Balance"
          value={
            <>
              <AnimatedCounter value={wallet.investmentBalance} /> BNB
            </>
          }
        />
        <Field
          label="Pending Rewards"
          value={
            <>
              <AnimatedCounter value={wallet.pendingRewards} /> BNB
            </>
          }
        />
        <Field
          label="Claimable Rewards"
          value={
            <>
              <AnimatedCounter value={wallet.claimableRewards} /> BNB
            </>
          }
        />
        <Field
          label="Next Reward Countdown"
          value={<Countdown target={wallet.nextRewardAt} />}
        />
        <Field label="Current Tier" value={wallet.tier} />
        <Field
          label="Referral Earnings"
          value={
            <>
              <AnimatedCounter value={wallet.referralEarnings} /> BNB
            </>
          }
        />
        <Field
          label="Total Deposited"
          value={
            <>
              <AnimatedCounter value={wallet.totalDeposited} /> BNB
            </>
          }
        />
        <Field
          label="Total Withdrawn"
          value={
            <>
              <AnimatedCounter value={wallet.totalWithdrawn} /> BNB
            </>
          }
        />
        <Field
          label="Total Profit"
          value={
            <>
              <AnimatedCounter value={wallet.totalProfit} /> BNB
            </>
          }
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-28 rounded-lg border border-[var(--color-border)] bg-black/20 px-3 text-sm outline-none focus:border-primary"
          aria-label="Amount"
        />
        {!wallet.connected ? (
          <Button onClick={() => void connect()}>Connect Wallet</Button>
        ) : (
          <Button variant="secondary" onClick={() => void disconnect()}>
            Disconnect Wallet
          </Button>
        )}
        <Button
          disabled={!wallet.connected || amt <= 0 || action.status === "loading"}
          onClick={() => void deposit(amt)}
        >
          Deposit
        </Button>
        <Button
          variant="secondary"
          disabled={!wallet.connected || amt <= 0 || action.status === "loading"}
          onClick={() => void withdraw(amt)}
        >
          Withdrawal
        </Button>
        <Button
          variant="success"
          disabled={!wallet.connected || action.status === "loading"}
          onClick={() => void claim()}
        >
          Claim Rewards
        </Button>
        <Button
          variant="secondary"
          disabled={!wallet.connected || action.status === "loading"}
          onClick={() => void compound()}
        >
          Compound
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void refresh()}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {action.message && (
        <p className="mt-3 text-xs text-muted">
          {action.message}
          {action.hash ? ` · ${shortAddr(action.hash, 8)}` : ""}
        </p>
      )}

      {!contractReady && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          DemoVault address not loaded yet. On Render, set{" "}
          <code className="text-amber-100">DEMO_VAULT_ADDRESS</code> on the{" "}
          <strong>API</strong> service (traders-api), not only on the web
          service — <code className="text-amber-100">NEXT_PUBLIC_*</code> values
          require a frontend rebuild. Soft-refresh after the API env is saved.
        </p>
      )}

      <div className="mt-4">
        <TxLifecycleProgress progress={txProgress} />
      </div>
    </GlassCard>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold ${mono ? "font-mono text-sky-300" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
