"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FlutterwavePublicConfig } from "@/components/payments/momo-payment-fields";

const ENV_MOMO_ENABLED = process.env.NEXT_PUBLIC_MOMO_ENABLED === "true";

function fallbackConfig(): FlutterwavePublicConfig {
  return {
    enabled: ENV_MOMO_ENABLED,
    currency: process.env.NEXT_PUBLIC_MOMO_CURRENCY ?? "UGX",
    countryCode: process.env.NEXT_PUBLIC_MOMO_COUNTRY_CODE ?? "256",
    usdRate: Number(process.env.NEXT_PUBLIC_MOMO_USD_RATE ?? "3800") || 3800,
    minDepositUsd: 3,
    networks: [
      { id: "MTN", label: "MTN MoMo" },
      { id: "AIRTEL", label: "Airtel Money" },
    ],
  };
}

/** Loads Flutterwave MoMo config; falls back to env when API is unavailable. */
export function useFlutterwaveConfig() {
  const [config, setConfig] = useState<FlutterwavePublicConfig | null>(
    ENV_MOMO_ENABLED ? fallbackConfig() : null,
  );

  useEffect(() => {
    let cancelled = false;
    void api.flutterwave
      .config()
      .then((cfg) => {
        if (cancelled) return;
        setConfig({
          ...fallbackConfig(),
          ...cfg,
          networks: cfg.networks?.length ? cfg.networks : fallbackConfig().networks,
          enabled: cfg.enabled || ENV_MOMO_ENABLED,
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (ENV_MOMO_ENABLED) setConfig(fallbackConfig());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    config,
    momoEnabled: Boolean(config?.enabled),
  };
}
