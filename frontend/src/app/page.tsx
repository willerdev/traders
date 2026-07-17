"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Shield,
  Trophy,
  Zap,
  TrendingUp,
  Users,
  Tag,
  Wallet,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecentPayoutsShowcase } from "@/components/marketing/recent-payouts-showcase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

type FeaturedPromo = {
  code: string;
  discountPercent: number;
  originalAmount: number;
  finalAmount: number;
};

const paths = [
  {
    icon: Trophy,
    title: "Trader",
    description:
      "Submit setups, climb the leaderboard, and get funded on a virtual account with weekly payouts.",
    href: "/register?intent=trader",
    cta: "Compete & Get Funded",
    accent: "border-rank-gold/30 bg-rank-gold/5",
  },
  {
    icon: LineChart,
    title: "Investor",
    description:
      "Choose your investment size, pay a tiered subscription fee, and earn daily yield on your balance — trade on platform MT5 or auto-copy.",
    href: "/register?intent=investor",
    cta: "Start Investing",
    accent: "border-cyan-500/30 bg-cyan-500/5",
  },
];

const features = [
  {
    icon: Zap,
    title: "Setup acquisition",
    description:
      "Submit immutable trade setups with screenshots. Compete weekly and earn TP rewards when price hits target.",
  },
  {
    icon: TrendingUp,
    title: "Smart investing",
    description:
      "Tiered subscription fees by capital size. Daily yield credited to wallet with a clear returns journal.",
  },
  {
    icon: Shield,
    title: "Anti-Cheat Engine",
    description:
      "Duplicate signal detection, screenshot hashing, IP monitoring, and risk flags keep competition fair.",
  },
  {
    icon: Trophy,
    title: "Rank & Scale System",
    description:
      "Bronze → Elite tiers with real-time leaderboard. Win rate, drawdown, and consistency all factor in.",
  },
  {
    icon: BarChart3,
    title: "Weekly Payouts",
    description:
      "Earn 40% of virtual profits. Payouts funded by subscriptions, premium memberships, and marketplace fees.",
  },
  {
    icon: Users,
    title: "Talent Discovery",
    description:
      "Prove your edge without broker complications. Top performers get visibility and scaling opportunities.",
  },
];

const tiers = [
  { name: "Bronze", balance: "$1,000", color: "text-amber-700" },
  { name: "Silver", balance: "$2,500", color: "text-gray-300" },
  { name: "Gold", balance: "$5,000", color: "text-rank-gold" },
  { name: "Diamond", balance: "$10,000", color: "text-cyan-400" },
  { name: "Elite", balance: "$25,000", color: "text-purple-400" },
];

export default function HomePage() {
  const [fee, setFee] = useState(5);
  const [promo, setPromo] = useState<FeaturedPromo | null>(null);
  const isLoggedIn = Boolean(useAuthStore((s) => s.token));

  const pathLinks = paths.map((path) => {
    if (path.title === "Investor" && isLoggedIn) {
      return { ...path, href: "/invest", cta: "Open Invest" };
    }
    if (path.title === "Trader" && isLoggedIn) {
      return { ...path, href: "/dashboard", cta: "Open Dashboard" };
    }
    return path;
  });

  useEffect(() => {
    api.payments
      .featuredPromo()
      .then((res) => {
        setFee(res.registrationFeeUsdt);
        setPromo(res.promo);
      })
      .catch(() => setPromo(null));
  }, []);

  return (
    <div className="relative overflow-hidden">
      <div className="gradient-orb -top-40 -left-40 h-96 w-96 bg-primary/20 animate-pulse-glow" />
      <div className="gradient-orb top-20 -right-40 h-80 w-80 bg-rank-gold/10 animate-pulse-glow" />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {promo && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="mb-6 flex justify-center"
            >
              <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-rank-gold/40 bg-rank-gold/10 px-4 py-2 text-sm">
                <Tag className="h-4 w-4 shrink-0 text-rank-gold" />
                <span className="font-semibold text-rank-gold">
                  Limited offer: {promo.discountPercent}% OFF
                </span>
                <span className="text-gray-300">
                  — use code{" "}
                  <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono font-bold uppercase text-white">
                    {promo.code}
                  </code>{" "}
                  at checkout and pay {promo.finalAmount} USDT instead of{" "}
                  {promo.originalAmount}
                </span>
              </div>
            </motion.div>
          )}
          <Badge variant="gold" className="mb-6">
            Trade · Invest · Earn
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-white">Your path.</span>
            <br />
            <span className="text-gradient">Your edge.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
            Choose how you want to participate — automated MT5 investing,
            stable daily earnings, or trader competition with funded accounts.
            One account can use all three.
          </p>

          <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pathLinks.map((path, i) => {
              const Icon = path.icon;
              return (
                <motion.div
                  key={path.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className={`glass-card flex flex-col rounded-2xl border p-6 text-left ${path.accent}`}
                >
                  <div className="mb-4 inline-flex rounded-xl bg-white/5 p-3 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-bold text-white">{path.title}</h2>
                  <p className="mt-2 flex-1 text-sm text-gray-400">
                    {path.description}
                  </p>
                  <Link href={path.href} className="mt-5">
                    <Button variant="secondary" className="w-full gap-2">
                      {path.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/leaderboard">
              <Button variant="ghost" size="lg">
                View Leaderboard
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Sign in
              </Button>
            </Link>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-gray-500">
            <Wallet className="h-4 w-4" />
            Pay with crypto (USDT) — deposits & withdrawals via NOWPayments
          </p>
        </motion.div>

        {/* Stats bar — trader path highlight */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {[
            { label: "Starting Balance", value: "$1,000" },
            { label: "Risk Per Trade", value: "5%" },
            { label: "Trader Payout", value: "40%" },
            { label: "Max Account", value: "$25,000" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass-card rounded-xl border border-white/10 p-4 text-center"
            >
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="mt-1 text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      <RecentPayoutsShowcase />

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">
            Built for Serious Traders
          </h2>
          <p className="mt-3 text-gray-400">
            Enterprise-grade architecture. Prop-firm style experience.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card rounded-2xl border border-white/10 p-6"
              >
                <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Tiers */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">Account Scaling</h2>
          <p className="mt-3 text-gray-400">
            Automatic scaling as your score and performance improve
          </p>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass-card w-36 rounded-2xl border border-white/10 p-5 text-center"
            >
              <p className={`text-sm font-bold ${tier.color}`}>{tier.name}</p>
              <p className="mt-2 text-xl font-extrabold text-white">
                {tier.balance}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="glass-card rounded-3xl border border-primary/20 bg-primary/5 p-10 text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to Prove Yourself?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-gray-400">
            {promo ? (
              <>
                Register for{" "}
                <span className="font-semibold text-rank-gold">
                  {promo.finalAmount} USDT
                </span>{" "}
                <span className="line-through opacity-60">
                  {promo.originalAmount} USDT
                </span>{" "}
                with code{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono font-bold uppercase text-white">
                  {promo.code}
                </code>
                .
              </>
            ) : (
              <>Register for {fee} USDT.</>
            )}{" "}
            Get your $1,000 virtual account. Start submitting signals today.
          </p>
          <Link href="/register" className="mt-8 inline-block">
            <Button size="lg" variant="gold" className="gap-2">
              Join TraderRank Pro
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-4 text-xs text-gray-500">
            Payments in USDT (TRC20, BEP20, ERC20) · Local payment methods
            coming soon
          </p>
        </div>
      </section>
    </div>
  );
}
