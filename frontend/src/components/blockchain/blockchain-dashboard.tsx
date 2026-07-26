"use client";

import { motion } from "framer-motion";
import { Blocks } from "lucide-react";
import { useBlockchain } from "@/hooks/use-blockchain";
import { ActivityFeed } from "./activity-feed";
import { AdminDashboardPanel } from "./admin-dashboard";
import { ContractStatusCards } from "./contract-status-cards";
import { BlockchainErrorBoundary } from "./error-boundary";
import { EventMonitor } from "./event-monitor";
import { InvestmentCharts } from "./investment-charts";
import { InvestorList } from "./investor-list";
import { NotificationsPanel } from "./notifications-panel";
import { TransactionHistory } from "./transaction-history";
import { WalletPanel } from "./wallet-panel";

export function BlockchainDashboard() {
  const { data, loading, error, refresh } = useBlockchain();

  return (
    <BlockchainErrorBoundary>
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <Blocks className="h-3.5 w-3.5" />
              On-chain investment
            </div>
            <h1 className="text-2xl font-bold tracking-tight xl:text-3xl">
              Blockchain Dashboard
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Modular contract layer with mock data today — swap{" "}
              <code className="text-sky-300">BlockchainService</code> to
              ethers.js / viem when the Solidity contract is live. UI stays the
              same.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-muted transition hover:border-primary/40 hover:text-foreground"
          >
            Live · refreshes every 30s
          </button>
        </motion.div>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
        >
          <ContractStatusCards
            contract={data?.contract ?? null}
            stats={data?.stats ?? null}
            loading={loading && !data}
          />
        </motion.section>

        <div className="grid gap-4 xl:grid-cols-5">
          <motion.div
            className="xl:col-span-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <WalletPanel
              wallet={data?.wallet ?? null}
              loading={loading && !data}
            />
          </motion.div>
          <motion.div
            className="xl:col-span-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <ActivityFeed
              items={data?.activity ?? []}
              loading={loading && !data}
            />
          </motion.div>
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Investment Statistics</h2>
          <InvestmentCharts
            stats={data?.statistics ?? null}
            loading={loading && !data}
          />
        </section>

        <TransactionHistory
          rows={data?.transactions ?? []}
          loading={loading && !data}
        />

        <InvestorList
          rows={data?.investors ?? []}
          loading={loading && !data}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <EventMonitor
            events={data?.events ?? []}
            loading={loading && !data}
          />
          <NotificationsPanel
            items={data?.notifications ?? []}
            loading={loading && !data}
          />
        </div>

        {(data?.admin || loading) && (
          <AdminDashboardPanel
            admin={data?.admin ?? null}
            health={data?.health ?? null}
            loading={loading && !data?.admin}
          />
        )}
      </div>
    </BlockchainErrorBoundary>
  );
}
