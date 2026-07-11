export type EvaluationTypeId = 'ZERO' | 'ONE_STEP' | 'TWO_STEP';
export type EvaluationVariantId = 'STANDARD' | 'FLEX' | 'PRO';

export type EvaluationPlanRules = {
  profitTargetPhase1: number | null;
  profitTargetPhase2: number | null;
  profitTargetMaster: number | null;
  consistencyPercent: number | null;
  maxLossPercent: number;
  dailyLossPercent: number;
  minTradingDays: number | null;
  minProfitableDays: number | null;
  profitSplitLabel: string;
};

export type EvaluationPlanTier = {
  id: string;
  evaluationSize: number;
  feeUsdt: number;
  avgFirstReward: number;
  mostPopular?: boolean;
};

export type EvaluationPlan = {
  type: EvaluationTypeId;
  variant: EvaluationVariantId;
  label: string;
  description: string;
  rules: EvaluationPlanRules;
  tiers: EvaluationPlanTier[];
};

/** FundingPips-style reference prices ÷10 for size and fee. */
const FP_TIERS = [
  { fpSize: 5000, fpOneStep: 59, fpZero: 60, fpTwoStep: 32, avgOne: 258, avgZero: 455, avgTwo: 180 },
  { fpSize: 10000, fpOneStep: 99, fpZero: 88, fpTwoStep: 59, avgOne: 506, avgZero: 426, avgTwo: 340 },
  { fpSize: 25000, fpOneStep: 210, fpZero: 188, fpTwoStep: 159, avgOne: 1024, avgZero: 1018, avgTwo: 820 },
  { fpSize: 50000, fpOneStep: 322, fpZero: 244, fpTwoStep: 269, avgOne: 1785, avgZero: 1598, avgTwo: 1400 },
  { fpSize: 100000, fpOneStep: 566, fpZero: 444, fpTwoStep: 555, avgOne: 3596, avgZero: 4144, avgTwo: 3200 },
  { fpSize: 200000, fpOneStep: 888, fpZero: 888, fpTwoStep: 888, avgOne: 5919, avgZero: 5919, avgTwo: 4800 },
] as const;

function tierId(type: EvaluationTypeId, variant: EvaluationVariantId, size: number) {
  return `${type.toLowerCase()}_${variant.toLowerCase()}_${size}`;
}

function buildTiers(
  type: EvaluationTypeId,
  variant: EvaluationVariantId,
  feeKey: 'fpOneStep' | 'fpZero' | 'fpTwoStep',
  avgKey: 'avgOne' | 'avgZero' | 'avgTwo',
): EvaluationPlanTier[] {
  return FP_TIERS.map((row, index) => ({
    id: tierId(type, variant, row.fpSize / 10),
    evaluationSize: row.fpSize / 10,
    feeUsdt: Math.round(row[feeKey] / 10),
    avgFirstReward: Math.round(row[avgKey] / 10),
    mostPopular: index === 4,
  }));
}

const ONE_STEP_RULES: EvaluationPlanRules = {
  profitTargetPhase1: 10,
  profitTargetPhase2: null,
  profitTargetMaster: null,
  consistencyPercent: null,
  maxLossPercent: 6,
  dailyLossPercent: 3,
  minTradingDays: 3,
  minProfitableDays: null,
  profitSplitLabel: 'Biweekly — 80%',
};

const ZERO_RULES: EvaluationPlanRules = {
  profitTargetPhase1: null,
  profitTargetPhase2: null,
  profitTargetMaster: null,
  consistencyPercent: 15,
  maxLossPercent: 5,
  dailyLossPercent: 3,
  minTradingDays: null,
  minProfitableDays: 7,
  profitSplitLabel: 'Biweekly — 95%',
};

function twoStepRules(variant: EvaluationVariantId): EvaluationPlanRules {
  const maxLoss =
    variant === 'STANDARD' ? 10 : variant === 'PRO' ? 8 : 12;
  return {
    profitTargetPhase1: 10,
    profitTargetPhase2: 6,
    profitTargetMaster: null,
    consistencyPercent: null,
    maxLossPercent: maxLoss,
    dailyLossPercent: 4,
    minTradingDays: 0,
    minProfitableDays: null,
    profitSplitLabel: 'Bi-Weekly — up to 95%',
  };
}

export const EVALUATION_PLANS: EvaluationPlan[] = [
  {
    type: 'ZERO',
    variant: 'FLEX',
    label: 'Zero',
    description: 'No profit target during evaluation — consistency and risk rules apply.',
    rules: ZERO_RULES,
    tiers: buildTiers('ZERO', 'FLEX', 'fpZero', 'avgZero'),
  },
  {
    type: 'ONE_STEP',
    variant: 'FLEX',
    label: '1 Step',
    description: 'Single evaluation phase with a 10% profit target.',
    rules: ONE_STEP_RULES,
    tiers: buildTiers('ONE_STEP', 'FLEX', 'fpOneStep', 'avgOne'),
  },
  ...(['STANDARD', 'FLEX', 'PRO'] as EvaluationVariantId[]).map((variant) => ({
    type: 'TWO_STEP' as EvaluationTypeId,
    variant,
    label: '2 Step',
    description: 'Two evaluation phases before master account.',
    rules: twoStepRules(variant),
    tiers: buildTiers('TWO_STEP', variant, 'fpTwoStep', 'avgTwo'),
  })),
];

export function findEvaluationPlan(
  type: EvaluationTypeId,
  variant: EvaluationVariantId,
  planId: string,
): { plan: EvaluationPlan; tier: EvaluationPlanTier } | null {
  const plan = EVALUATION_PLANS.find(
    (row) => row.type === type && row.variant === variant,
  );
  if (!plan) return null;
  const tier = plan.tiers.find((row) => row.id === planId);
  if (!tier) return null;
  return { plan, tier };
}

export function listEvaluationPlans() {
  return EVALUATION_PLANS.map(({ type, variant, label, description, rules, tiers }) => ({
    type,
    variant,
    label,
    description,
    rules,
    tiers,
  }));
}
