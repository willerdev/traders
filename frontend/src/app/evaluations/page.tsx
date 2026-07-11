"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvaluationTypeToggle } from "@/components/evaluations/evaluation-type-toggle";
import { EvaluationVariantToggle } from "@/components/evaluations/evaluation-variant-toggle";
import { EvaluationTierSelector } from "@/components/evaluations/evaluation-tier-selector";
import { EvaluationPlanDetail } from "@/components/evaluations/evaluation-plan-detail";
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

type CheckoutSelection = {
  planId: string;
  tier: EvaluationPlanTier;
};

function programLabel(type: EvaluationTypeId, variant: EvaluationVariantId) {
  if (type === "ZERO") return "Zero program";
  if (type === "ONE_STEP") return "1 Step program";
  return `2 Step · ${variant.charAt(0) + variant.slice(1).toLowerCase()}`;
}

export default function EvaluationsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [type, setType] = useState<EvaluationTypeId>("ONE_STEP");
  const [variant, setVariant] = useState<EvaluationVariantId>("FLEX");
  const [selectedTierId, setSelectedTierId] = useState<string>("");
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutSelection | null>(null);

  const plan = useMemo(
    () => getPlansForSelection(type, variant) ?? EVALUATION_PLANS[1],
    [type, variant],
  );

  useEffect(() => {
    if (type !== "TWO_STEP") {
      setVariant("FLEX");
    }
  }, [type]);

  useEffect(() => {
    const popular = plan.tiers.find((t) => t.mostPopular);
    const fallback = plan.tiers[0];
    const keepCurrent = plan.tiers.some((t) => t.id === selectedTierId);
    if (!keepCurrent) {
      setSelectedTierId((popular ?? fallback)?.id ?? "");
    }
  }, [plan, selectedTierId]);

  const selectedTier =
    plan.tiers.find((t) => t.id === selectedTierId) ?? plan.tiers[0];

  const handleStart = (tier: EvaluationPlanTier) => {
    if (!token) {
      router.push("/login?redirect=/evaluations");
      return;
    }
    setCheckout({ planId: tier.id, tier });
  };

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      <section className="relative overflow-hidden border-b border-[var(--color-border)] px-4 py-8 md:py-12">
        <div className="gradient-orb -left-20 top-0 h-48 w-48 bg-primary/15" />
        <div className="relative mx-auto max-w-6xl text-center md:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Get Funded
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl md:text-4xl">
            Evaluation Programs
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted md:mx-0 md:text-base">
            Pick a program type and size, then trade on MT5 within clear risk
            limits. Pass phases to unlock profit splits.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:py-10">
        <div className="space-y-4">
          <EvaluationTypeToggle value={type} onChange={setType} />

          {type === "TWO_STEP" ? (
            <EvaluationVariantToggle value={variant} onChange={setVariant} />
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{plan.description}</p>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted"
              onClick={() => setPhasesOpen(true)}
            >
              <BookOpen className="mr-1.5 h-4 w-4" />
              Phases
            </Button>
          </div>
        </div>

        {/* Mobile + tablet: tier pills + single detail card */}
        <div className="space-y-4 lg:hidden">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Select size
            </p>
            <EvaluationTierSelector
              tiers={plan.tiers}
              value={selectedTier?.id ?? ""}
              onChange={setSelectedTierId}
            />
          </div>

          {selectedTier ? (
            <EvaluationPlanDetail
              tier={selectedTier}
              rules={plan.rules}
              type={plan.type}
              programLabel={programLabel(type, variant)}
              onStart={() => handleStart(selectedTier)}
            />
          ) : null}
        </div>

        {/* Desktop: comparison grid */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-3 xl:grid-cols-3">
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

        {!token ? (
          <p className="text-center text-sm text-muted lg:text-left">
            Already have an account?{" "}
            <Link
              href="/login?redirect=/evaluations"
              className="text-primary hover:underline"
            >
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
