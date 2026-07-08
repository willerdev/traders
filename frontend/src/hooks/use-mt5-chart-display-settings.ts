"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MT5_CHART_DISPLAY_SETTINGS,
  MT5_CHART_SETTINGS_EVENT,
  type Mt5ChartDisplaySettings,
  readMt5ChartDisplaySettings,
  writeMt5ChartDisplaySettings,
} from "@/lib/mt5-chart-display-settings";

export function useMt5ChartDisplaySettings() {
  const [settings, setSettings] = useState<Mt5ChartDisplaySettings>(
    DEFAULT_MT5_CHART_DISPLAY_SETTINGS,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(readMt5ChartDisplaySettings());
    setHydrated(true);

    function onChange(e: Event) {
      const detail = (e as CustomEvent<Mt5ChartDisplaySettings>).detail;
      if (detail) setSettings(detail);
      else setSettings(readMt5ChartDisplaySettings());
    }

    window.addEventListener(MT5_CHART_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(MT5_CHART_SETTINGS_EVENT, onChange);
  }, []);

  const setSetting = useCallback(
    <K extends keyof Mt5ChartDisplaySettings>(
      key: K,
      value: Mt5ChartDisplaySettings[K],
    ) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        writeMt5ChartDisplaySettings(next);
        return next;
      });
    },
    [],
  );

  return { settings, setSetting, hydrated };
}
