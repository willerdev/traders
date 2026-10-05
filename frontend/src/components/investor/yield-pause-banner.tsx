"use client";

/** Monday 28 September 2026 00:00 Africa/Kampala (UTC+3). Do not mention Kampala in UI. */
export const SMART_INVEST_YIELD_RESUME_AT = new Date(
  "2026-09-27T21:00:00.000Z",
);
export const SMART_INVEST_YIELD_RESUME_LABEL = "Monday 28 September 2026";

export function isSmartInvestYieldPaused(now = Date.now()) {
  return now < SMART_INVEST_YIELD_RESUME_AT.getTime();
}

/** Short notice: daily yield is paused until Monday 28 September 2026. */
export function YieldPauseBanner({ className }: { className?: string }) {
  if (!isSmartInvestYieldPaused()) return null;

  return (
    <div
      className={
        className ??
        "rounded-xl border border-amber-400/35 bg-amber-500/10 p-3.5 text-sm text-amber-50"
      }
    >
      <p className="font-semibold text-amber-100">Daily yield paused</p>
      <p className="mt-1 leading-relaxed text-amber-100/85">
        Smart Invest daily revenue yield is paused and continues{" "}
        <strong>{SMART_INVEST_YIELD_RESUME_LABEL}</strong> on the usual weekday
        schedule.
      </p>
    </div>
  );
}
