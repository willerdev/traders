"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type LoanQuote, type LoanRow } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const TERMS = ["DAILY", "WEEKLY", "MONTHLY"] as const;

export function LoansHub() {
  const [term, setTerm] = useState<(typeof TERMS)[number]>("WEEKLY");
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [q, list] = await Promise.all([
        api.loans.quote(term),
        api.loans.list(),
      ]);
      setQuote(q);
      setLoans(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loans");
    } finally {
      setLoading(false);
    }
  }, [term]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function requestLoan() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.loans.request(term);
      setMessage("Loan request submitted — check your email. Waiting for admin approval.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelLoan(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.loans.cancel(id);
      setMessage("Loan request cancelled.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function repayLoan(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.loans.repay(id);
      setMessage("Loan repaid — confirmation emailed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repay failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !quote) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-sky-300/80">
          Earnings advance
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          Borrow 80% of projected earnings
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Daily / weekly / monthly based on your Smart Invest + Unitrust daily
          yield. You receive 80% in advance and repay with 20% interest on that
          advance. KYC required. Admin must approve. While the loan is open you
          may only withdraw the loan advance — repay to unlock other withdrawals.
        </p>
        {quote && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-xs text-gray-500">Est. daily earning</div>
              <div className="font-medium text-white">
                {formatCurrency(quote.dailyEarning)}
              </div>
            </div>
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-xs text-gray-500">Invested corpus</div>
              <div className="font-medium text-white">
                {formatCurrency(quote.corpus)}
              </div>
            </div>
          </div>
        )}
        {quote && !quote.eligible && (
          <p className="mt-3 text-sm text-amber-300">
            Need at least {formatCurrency(quote.minCorpusUsdt)} invested and ~
            {formatCurrency(quote.minDailyEarningUsdt)}/day projected earnings.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {TERMS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                term === t
                  ? "bg-primary text-white"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {quote && (
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex justify-between">
              <span>Period</span>
              <span>{quote.periodDays} day(s)</span>
            </li>
            <li className="flex justify-between">
              <span>Projected earnings</span>
              <span>{formatCurrency(quote.projectedEarnings)}</span>
            </li>
            <li className="flex justify-between text-white">
              <span>You receive (80%)</span>
              <span className="font-semibold">
                {formatCurrency(quote.principal)}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Interest (20% of advance)</span>
              <span>{formatCurrency(quote.interestAmount)}</span>
            </li>
            <li className="flex justify-between text-emerald-300">
              <span>Total to repay</span>
              <span className="font-semibold">
                {formatCurrency(quote.totalDue)}
              </span>
            </li>
          </ul>
        )}

        <p className="text-xs text-gray-500">{quote?.explanation}</p>

        <Button
          className="w-full"
          disabled={busy || !quote?.eligible}
          onClick={() => void requestLoan()}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Request {term.toLowerCase()} loan
        </Button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="mb-3 font-medium text-white">Your loans</h3>
        {loans.length === 0 ? (
          <p className="text-sm text-gray-500">No loan requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {loans.map((loan) => (
              <li
                key={loan.id}
                className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
              >
                <div className="flex justify-between text-white">
                  <span>
                    {loan.term} · {loan.status}
                  </span>
                  <span>{formatCurrency(loan.principal)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Repay {formatCurrency(loan.totalDue)}
                  {loan.dueAt
                    ? ` · due ${new Date(loan.dueAt).toLocaleDateString()}`
                    : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  {loan.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void cancelLoan(loan.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {loan.status === "APPROVED" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void repayLoan(loan.id)}
                    >
                      Repay {formatCurrency(loan.totalDue)}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
