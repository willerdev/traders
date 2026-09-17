"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ContractStats, ContractStatus } from "@/lib/blockchain/types";
import {
  AnimatedCounter,
  GlassCard,
  shortAddr,
  Skeleton,
  StatusDot,
} from "./ui-kit";

const NETWORKS = [
  { id: "ethereum", label: "Ethereum" },
  { id: "bnb", label: "BNB Smart Chain" },
  { id: "base", label: "Base" },
  { id: "polygon", label: "Polygon" },
] as const;

export function ContractStatusCards({
  contract,
  stats,
  loading,
}: {
  contract: ContractStatus | null;
  stats: ContractStats | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (loading || !contract || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(contract.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <GlassCard title="Contract Status">
        <div className="space-y-2">
          <StatusDot
            tone={contract.connection === "connected" ? "success" : "muted"}
            label={
              contract.connection === "connected" ? "Connected" : "Not Connected"
            }
          />
          <StatusDot
            tone={contract.networkMode === "mainnet" ? "success" : "warning"}
            label={contract.networkMode === "mainnet" ? "Mainnet" : "Testnet"}
          />
        </div>
      </GlassCard>

      <GlassCard
        title="Contract Address"
        action={
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => void copy()} title="Copy">
              <Copy className="h-4 w-4" />
            </Button>
            <a
              href={`${contract.explorerBaseUrl}/address/${contract.contractAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button size="icon" variant="ghost" title="Open Explorer">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        }
      >
        <p className="font-mono text-sm text-sky-300">
          {shortAddr(contract.contractAddress, 6)}
        </p>
        {copied && <p className="mt-1 text-xs text-emerald-400">Copied</p>}
      </GlassCard>

      <GlassCard title="Network">
        <ul className="space-y-1.5 text-sm">
          {NETWORKS.map((n) => (
            <li
              key={n.id}
              className={
                contract.network === n.id
                  ? "font-semibold text-primary"
                  : "text-muted"
              }
            >
              {contract.network === n.id ? "● " : "○ "}
              {n.label}
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard title="Contract Balance">
        <p className="text-2xl font-bold tracking-tight">
          <AnimatedCounter value={stats.contractBalance} /> {stats.symbol}
        </p>
        <p className="mt-1 text-sm text-muted">
          $<AnimatedCounter value={stats.contractBalanceUsd} decimals={0} />
        </p>
      </GlassCard>

      <GlassCard title="Total Value Locked">
        <p className="text-2xl font-bold">
          <AnimatedCounter value={stats.tvl} /> {stats.symbol}
        </p>
      </GlassCard>

      <GlassCard title="Activity">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted">Deposits</dt>
            <dd className="font-semibold">
              <AnimatedCounter value={stats.totalDeposits} decimals={0} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Withdrawals</dt>
            <dd className="font-semibold">
              <AnimatedCounter value={stats.totalWithdrawals} decimals={0} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Investors</dt>
            <dd className="font-semibold">
              <AnimatedCounter value={stats.activeInvestors} decimals={0} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Rewards</dt>
            <dd className="font-semibold">
              <AnimatedCounter value={stats.totalRewardsDistributed} />{" "}
              {stats.symbol}
            </dd>
          </div>
        </dl>
      </GlassCard>

      <GlassCard title="Gas Price">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Current</dt>
            <dd>{stats.gas.current} gwei</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Average</dt>
            <dd>{stats.gas.average} gwei</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">High</dt>
            <dd className="text-amber-300">{stats.gas.high} gwei</dd>
          </div>
        </dl>
      </GlassCard>

      <GlassCard title="Latest Block">
        <p className="font-mono text-2xl font-bold text-sky-300">
          <AnimatedCounter value={stats.latestBlock} decimals={0} />
        </p>
        <p className="mt-1 text-xs text-muted">Current block number</p>
      </GlassCard>
    </div>
  );
}
