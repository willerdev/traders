"use client";

import { cn } from "@/lib/utils";

type Props = {
  name: string;
  visible?: boolean;
  className?: string;
};

export function ChartUserWatermark({ name, visible = true, className }: Props) {
  if (!visible || !name.trim()) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] flex items-center justify-center overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <span
        className="max-w-[90%] select-none text-center text-[clamp(1.75rem,11vw,4.5rem)] font-bold uppercase leading-none tracking-[0.2em] text-[var(--mt5-text)] opacity-[0.13]"
        style={{ textShadow: "0 0 40px rgba(74, 158, 255, 0.15)" }}
      >
        {name.trim()}
      </span>
    </div>
  );
}
