"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvaluationTypeToggle } from "@/components/evaluations/evaluation-type-toggle";
import { EvaluationVariantToggle } from "@/components/evaluations/evaluation-variant-toggle";
import { EvaluationPlanCard } from "@/components/evaluations/evaluation-plan-card";
import { EvaluationPhasesDialog } from "@/components/evaluations/evaluation-phases-dialog";
import { EvaluationCheckoutPanel } from "@/components/evaluations/evaluation-checkout-panel";
import {
  EVALUATION_PLANS,
  getPlansForSelection,
  type EvaluationPlanTier,
  type EvaluationTypeId,
  type EvaluationVariantId,
} from "@/lib/evaluation-plans";
import { useAuthStore } from "@/stores/auth";
import Link from "next/link";

type CheckoutSelection = {
  planId: string;
  tier: EvaluationPlanTier;
};

export default function EvaluationsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [type, setType] = useState<EvaluationTypeId>("ONE_STEP");
  const [variant, setVariant] = useState<EvaluationVariantId>("FLEX");
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutSelection | null>(null);

  useEffect(() => {
    if (type !== "TWO_STEP") {
      setVariant("FLEX");
    }
  }, [type]);

  const plan = useMemo(
    () => getPlansForSelection(type, variant) ?? EVALUATION_PLANS[1],
    [type, variant],
  );

  const handleStart = (tier: EvaluationPlanTier) => {
    if (!token) {
      router.push("/login?redirect=/evaluations");
      return;
    }
    setCheckout({ planId: tier.id, tier });
  };

  return (
    <div className="min-h-screen pb-20">
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">
            Get Funded
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Evaluation Programs</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted">
            Choose your program size and trade on MT5 within professional risk
            rules. Pass evaluation phases to unlock profit splits.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-slate-50 px-4 py-8 shadow-inner md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
              <span>🇺🇸</span>
              <span>$ USD</span>
            </div>

            <EvaluationTypeToggle value={type} onChange={setType} />

            <Button
              variant="secondary"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              onClick={() => setPhasesOpen(true)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Phases
            </Button>
          </div>

          {type === "TWO_STEP" ? (
            <div className="mt-4 flex justify-center">
              <EvaluationVariantToggle value={variant} onChange={setVariant} />
            </div>
          ) : null}

          <p className="mt-4 text-center text-sm text-slate-500">{plan.description}</p>

          <div className="mt-8 flex gap-4 overflow-x-auto pb-4 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {plan.tiers.map((tier) => (
              <EvaluationPlanCard
                key={tier.id}
                tier={tier}
                rules={plan.rules}
                type={plan.type}
                highlighted={tier.mostPopular}
                onStart={() => handleStart(tier)}
              />
            ))}
          </div>
        </div>

        {!token ? (
          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login?redirect=/evaluations" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to start an evaluation.
          </p>
        ) : null}
      </section>

      <EvaluationPhasesDialog open={phasesOpen} onOpenChange={setPhasesOpen} />

      {checkout ? (
        <EvaluationCheckoutPanel
          planId={checkout.planId}
          evaluationType={plan.type}
          variant={plan.variant}
          evaluationSize={checkout.tier.evaluationSize}
          feeUsdt={checkout.tier.feeUsdt}
          onClose={() => setCheckout(null)}
          onComplete={() => {
            setCheckout(null);
            router.push("/dashboard");
          }}
        />
      ) : null}
    </div>
  );
}
