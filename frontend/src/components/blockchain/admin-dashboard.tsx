"use client";

import { Button } from "@/components/ui/button";
import { useBlockchain } from "@/hooks/use-blockchain";
import type { AdminDashboard, ContractHealth } from "@/lib/blockchain/types";
import {
  AnimatedCounter,
  GlassCard,
  shortAddr,
  Skeleton,
  StatusDot,
} from "./ui-kit";

export function AdminDashboardPanel({
  admin,
  health,
  loading,
}: {
  admin: AdminDashboard | null;
  health: ContractHealth | null;
  loading: boolean;
}) {
  const { runAdmin, refresh } = useBlockchain();

  if (loading) return <Skeleton className="h-[32rem]" />;
  if (!admin || !health) return null;

  const cards: { label: string; value: React.ReactNode }[] = [
    {
      label: "Current Contract Balance",
      value: (
        <>
          <AnimatedCounter value={admin.contractBalance} /> POL
        </>
      ),
    },
    {
      label: "Pending Withdrawals",
      value: (
        <>
          <AnimatedCounter value={admin.pendingWithdrawals} /> POL
        </>
      ),
    },
    {
      label: "Pending Deposits",
      value: (
        <>
          <AnimatedCounter value={admin.pendingDeposits} /> POL
        </>
      ),
    },
    {
      label: "Users Online",
      value: <AnimatedCounter value={admin.usersOnline} decimals={0} />,
    },
    {
      label: "Daily Revenue",
      value: (
        <>
          <AnimatedCounter value={admin.dailyRevenue} /> POL
        </>
      ),
    },
    {
      label: "Weekly Revenue",
      value: (
        <>
          <AnimatedCounter value={admin.weeklyRevenue} /> POL
        </>
      ),
    },
    {
      label: "Monthly Revenue",
      value: (
        <>
          <AnimatedCounter value={admin.monthlyRevenue} /> POL
        </>
      ),
    },
    {
      label: "Total Fees Collected",
      value: (
        <>
          <AnimatedCounter value={admin.totalFeesCollected} /> POL
        </>
      ),
    },
    {
      label: "Current APY",
      value: (
        <>
          <AnimatedCounter value={admin.currentApy} />%
        </>
      ),
    },
    { label: "Contract Version", value: admin.contractVersion },
    { label: "Current Network", value: admin.currentNetwork },
    {
      label: "Owner Address",
      value: (
        <span className="font-mono text-xs text-sky-300">
          {shortAddr(admin.ownerAddress, 6)}
        </span>
      ),
    },
    {
      label: "Treasury Wallet",
      value: (
        <span className="font-mono text-xs">{shortAddr(admin.treasuryWallet, 4)}</span>
      ),
    },
    {
      label: "Reserve Wallet",
      value: (
        <span className="font-mono text-xs">{shortAddr(admin.reserveWallet, 4)}</span>
      ),
    },
    {
      label: "Emergency Wallet",
      value: (
        <span className="font-mono text-xs">{shortAddr(admin.emergencyWallet, 4)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Admin Dashboard</h2>
          <p className="text-sm text-muted">Visible to administrators only</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <GlassCard key={c.label}>
            <p className="text-[11px] uppercase tracking-wider text-muted">
              {c.label}
            </p>
            <p className="mt-2 text-lg font-semibold">{c.value}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard title="Admin Actions">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="danger"
            onClick={() => void runAdmin((s) => s.pauseContract())}
          >
            Pause Contract
          </Button>
          <Button
            size="sm"
            variant="success"
            onClick={() => void runAdmin((s) => s.unpauseContract())}
          >
            Unpause Contract
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runAdmin((s) => s.updateRewardRate(18.6))}
          >
            Update Reward Rate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void runAdmin((s) =>
                s.updateTreasuryWallet(admin.treasuryWallet),
              )
            }
          >
            Update Treasury Wallet
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runAdmin((s) => s.updateFee(50))}
          >
            Update Fee
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void runAdmin((s) => s.emergencyWithdraw())}
          >
            Emergency Withdrawal
          </Button>
          <Button
            size="sm"
            onClick={() => void runAdmin((s) => s.sync())}
          >
            Sync Blockchain
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Refresh Data
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runAdmin((s) => s.reindexTransactions())}
          >
            Reindex Transactions
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runAdmin((s) => s.reconnectRpc())}
          >
            Reconnect RPC
          </Button>
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard title="Contract Health">
          <div className="mb-4">
            <p className="text-3xl font-bold text-emerald-300">
              <AnimatedCounter value={health.healthScore} decimals={0} />
              <span className="text-base text-muted"> / 100</span>
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Liquidity Ratio" value={health.liquidityRatio.toFixed(2)} />
            <Stat label="Reserve Ratio" value={health.reserveRatio.toFixed(2)} />
            <Stat
              label="Reward Sustainability"
              value={health.rewardSustainability.toFixed(2)}
            />
            <Stat label="Pending Claims" value={String(health.pendingClaims)} />
            <Stat
              label="Avg Claim Time"
              value={`${health.averageClaimTimeHours}h`}
            />
            <Stat label="Avg Deposit" value={`${health.averageDeposit} POL`} />
            <Stat
              label="Avg Withdrawal"
              value={`${health.averageWithdrawal} POL`}
            />
            <Stat label="RPC Latency" value={`${health.rpcLatencyMs} ms`} />
            <Stat label="Block Delay" value={String(health.blockDelay)} />
            <Stat
              label="Last Sync"
              value={new Date(health.lastSynchronization).toLocaleTimeString()}
            />
          </dl>
        </GlassCard>

        <GlassCard title="Service Status">
          <div className="space-y-3">
            <ServiceRow label="Blockchain" status={health.blockchainStatus} />
            <ServiceRow label="Database" status={health.databaseStatus} />
            <ServiceRow label="API" status={health.apiStatus} />
            <ServiceRow label="Wallet Service" status={health.walletServiceStatus} />
            <ServiceRow label="Explorer" status={health.explorerStatus} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function ServiceRow({
  label,
  status,
}: {
  label: string;
  status: "healthy" | "degraded" | "down";
}) {
  const tone =
    status === "healthy" ? "success" : status === "degraded" ? "warning" : "danger";
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
      <span className="text-sm">{label}</span>
      <StatusDot tone={tone} label={status} />
    </div>
  );
}
