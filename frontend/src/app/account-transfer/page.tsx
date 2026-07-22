"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { api } from "@/lib/api";

type TransferSummary = Awaited<
  ReturnType<typeof api.accountTransfers.byToken>
>;

function AccountTransferForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [summary, setSummary] = useState<TransferSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [agreeing, setAgreeing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [finalizeAfter, setFinalizeAfter] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("This transfer link is missing or incomplete.");
      return;
    }
    setLoading(true);
    void api.accountTransfers
      .byToken(token)
      .then((res) => {
        setSummary(res);
        if (res.status === "IN_REVIEW" || res.status === "COMPLETED") {
          setAgreed(true);
          setFinalizeAfter(res.finalizeAfter);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load transfer"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAgree() {
    if (!token || !checked) return;
    setAgreeing(true);
    setError("");
    try {
      const res = await api.accountTransfers.agree(token);
      setAgreed(true);
      setFinalizeAfter(res.finalizeAfter);
      setSummary((prev) =>
        prev ? { ...prev, status: res.status, canAgree: false } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve transfer");
    } finally {
      setAgreeing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!summary && error) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Invalid transfer link</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button className="w-full" variant="secondary">
              Back to sign in
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  if (agreed) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">In review</CardTitle>
          <CardDescription>
            You approved the transfer. Assets stay in review for 24 hours, then
            appear on this account and the old account is banned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-gray-300">
          {finalizeAfter ? (
            <p>
              Expected completion:{" "}
              <strong>{new Date(finalizeAfter).toLocaleString()}</strong>
            </p>
          ) : null}
          <Link href="/wallet">
            <Button className="w-full">Open wallet</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Account asset transfer</CardTitle>
        <CardDescription>
          Move assets from a duplicate account onto the account you want to keep.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
          <p>
            <span className="text-gray-500">From (will be banned):</span>{" "}
            <strong>
              {summary.fromDisplayName} ({summary.fromEmailMasked})
            </strong>
          </p>
          <p className="mt-2">
            <span className="text-gray-500">To (this account):</span>{" "}
            <strong>
              {summary.toDisplayName} ({summary.toEmailMasked})
            </strong>
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Available: ${summary.availableBalance.toFixed(2)} USDT</li>
            <li>Locked: ${summary.lockedBalance.toFixed(2)} USDT</li>
            <li>Investment: ${summary.investorBalance.toFixed(2)} USDT</li>
          </ul>
        </div>

        <div className="space-y-2 text-sm text-gray-400">
          <p className="font-semibold text-gray-200">Agreement</p>
          <p>
            By approving, you confirm both accounts belong to you, balances and
            transaction history will move to the keep account after a{" "}
            <strong className="text-gray-200">24-hour review</strong>, and the
            source account will then be <strong className="text-gray-200">banned</strong>.
            Funds are not spendable on the keep account until review completes.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={!summary.canAgree}
          />
          <span>
            I have read this agreement and approve the transfer onto this account.
          </span>
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!summary.canAgree ? (
          <p className="text-sm text-amber-300/90">
            {summary.expired
              ? "This link has expired. Ask support/admin to create a new transfer."
              : `This transfer cannot be approved (status: ${summary.status}).`}
          </p>
        ) : null}

        <Button
          className="w-full"
          disabled={!summary.canAgree || !checked || agreeing}
          onClick={() => void handleAgree()}
        >
          {agreeing ? "Approving…" : "I agree and transfer"}
        </Button>

        <p className="text-center text-sm text-gray-400">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function AccountTransferPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }
        >
          <AccountTransferForm />
        </Suspense>
      </motion.div>
    </div>
  );
}
