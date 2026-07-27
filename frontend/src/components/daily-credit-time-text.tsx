"use client";

import { useEffect, useState } from "react";
import {
  dailyCreditTimeAround,
  dailyCreditTimeShort,
} from "@/lib/daily-credit-time";

/**
 * Renders the daily credit clock in the visitor's local country time
 * (never mentions Kampala). Uses profile country when provided; otherwise
 * browser timezone labeled as "your local country time".
 */
export function DailyCreditTimeText({
  country,
  variant = "short",
  prefix = "",
}: {
  country?: string | null;
  variant?: "short" | "around";
  /** e.g. " · credited " or "earns yield " */
  prefix?: string;
}) {
  const [label, setLabel] = useState(
    variant === "around"
      ? "around your local country time"
      : "~your local country time",
  );

  useEffect(() => {
    setLabel(
      variant === "around"
        ? dailyCreditTimeAround(country)
        : dailyCreditTimeShort(country),
    );
  }, [country, variant]);

  return (
    <>
      {prefix}
      {label}
    </>
  );
}
