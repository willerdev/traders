"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Blocks, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PRODUCTS = [
  {
    id: "wallet",
    href: "/wallet",
    icon: Wallet,
    title: "Wallet",
    tagline: "Deposit USDT or MoMo, withdraw, save payout wallets",
    how: [
      "Fund with NOWPayments USDT or mobile money.",
      "Keep a cash buffer for fees and withdrawals.",
      "Saved wallets speed up later withdrawals.",
    ],
    cta: "Open Wallet",
  },
  {
    id: "invest",
    href: "/invest",
    icon: TrendingUp,
    title: "Smart Invest",
    tagline: "Put capital to work with daily yield",
    how: [
      "Move wallet balance into Smart Invest after the enrollment fee.",
      "Daily yield credits after a 24-hour hold on new allocations.",
      "VIP unlocks a higher daily rate and $0 withdraw fees. Yield does not credit on Saturday or Sunday.",
    ],
    cta: "Open Smart Invest",
  },
  {
    id: "blockchain",
    href: "/blockchain",
    icon: Blocks,
    title: "Contract",
    tagline: "On-chain enrollment, deposit, and withdraw",
    how: [
      "Enroll on the blockchain contract when you want on-chain records.",
      "Deposits and withdrawals follow the same contract flow as Trade Guard.",
    ],
    cta: "Open Contract",
  },
] as const;

export function InvestmentHome({ displayName }: { displayName?: string }) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-2"
      >
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          {displayName ? `Welcome, ${displayName}` : "solo Emma"}
        </h1>
        <p className="max-w-2xl text-sm text-gray-400 sm:text-base">
          Deposit, earn on Smart Invest, and manage the blockchain contract. No
          trader tools, referrals, or platform KYC.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-2"
      >
        {PRODUCTS.map((product) => {
          const Icon = product.icon;
          return (
            <Link key={product.id} href={product.href}>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {product.title}
              </Button>
            </Link>
          );
        })}
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PRODUCTS.map((product, i) => {
          const Icon = product.icon;
          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{product.title}</CardTitle>
                  <p className="text-sm text-gray-400">{product.tagline}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-400">
                  <ul className="list-disc space-y-1 pl-4">
                    {product.how.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <Link href={product.href}>
                    <Button className="w-full">{product.cta}</Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
