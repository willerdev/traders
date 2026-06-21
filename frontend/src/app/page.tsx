"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Shield,
  Trophy,
  Zap,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: TrendingUp,
    title: "Virtual Funded Accounts",
    description:
      "Start with $1,000 virtual balance. Fixed 2% risk per trade. Scale up to $25,000 as you climb ranks.",
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
    icon: Zap,
    title: "Immutable Signals",
    description:
      "Submit setups before execution. Every signal gets a unique ID and timestamp — no edits allowed.",
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
          <Badge variant="gold" className="mb-6">
            Trader Talent Discovery Platform
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-white">Prove Your Edge.</span>
            <br />
            <span className="text-gradient">Get Funded.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
            Submit trading setups before execution. Compete on a fair virtual
            funded account. Climb from Bronze to Elite and earn weekly payouts
            — no broker required.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Start Trading — 5 USDT
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/leaderboard">
              <Button variant="secondary" size="lg">
                View Leaderboard
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {[
            { label: "Starting Balance", value: "$1,000" },
            { label: "Risk Per Trade", value: "2%" },
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
            Register for 5 USDT. Get your $1,000 virtual account. Start
            submitting signals today.
          </p>
          <Link href="/register" className="mt-8 inline-block">
            <Button size="lg" variant="gold" className="gap-2">
              Join TraderRank Pro
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
