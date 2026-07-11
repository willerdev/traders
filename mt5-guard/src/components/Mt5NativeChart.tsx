import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import type { UserMt5OhlcBar } from "../lib/types";
import { fmtPrice } from "../lib/format";

const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"] as const;
export type Mt5ChartTimeframe = (typeof TIMEFRAMES)[number];

type Props = {
  symbol: string;
  flex?: boolean;
  active?: boolean;
};

export function Mt5NativeChart({ symbol, flex, active = true }: Props) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const [timeframe, setTimeframe] = useState<Mt5ChartTimeframe>("M5");
  const [bars, setBars] = useState<UserMt5OhlcBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 300, h: 220 });
  const [lastMid, setLastMid] = useState<number | null>(null);

  const loadOhlc = useCallback(async () => {
    try {
      const res = await api.signals.mt5Ohlc(symbol, timeframe, 120);
      setBars(res.bars ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chart load failed");
    } finally {
      setLoading(false);
    }
  }, [api, symbol, timeframe]);

  useEffect(() => {
    setLoading(true);
    void loadOhlc();
  }, [loadOhlc]);

  useEffect(() => {
    if (!active) return;
    const ohlcId = setInterval(() => void loadOhlc(), 15000);
    return () => clearInterval(ohlcId);
  }, [active, loadOhlc]);

  useEffect(() => {
    if (!active || bars.length === 0) return;

    async function tickQuote() {
      try {
        const q = await api.signals.mt5Quote(symbol);
        setLastMid(q.mid);
        setBars((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const last = { ...next[next.length - 1] };
          const price = q.mid ?? q.ask ?? q.bid;
          if (price == null) return prev;
          last.close = price;
          last.high = Math.max(last.high, price);
          last.low = Math.min(last.low, price);
          next[next.length - 1] = last;
          return next;
        });
      } catch {
        /* keep last */
      }
    }

    void tickQuote();
    const id = setInterval(() => void tickQuote(), 800);
    return () => clearInterval(id);
  }, [active, api, symbol, bars.length]);

  const candles = useMemo(() => {
    if (bars.length === 0 || size.w < 10) return null;
    const pad = 8;
    const w = size.w - pad * 2;
    const h = size.h - pad * 2;
    const lows = bars.map((b) => b.low);
    const highs = bars.map((b) => b.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;
    const slot = w / bars.length;
    const bodyW = Math.max(2, slot * 0.55);

    return bars.map((b, i) => {
      const x = pad + i * slot + slot / 2;
      const y = (v: number) => pad + h - ((v - min) / range) * h;
      const openY = y(b.open);
      const closeY = y(b.close);
      const highY = y(b.high);
      const lowY = y(b.low);
      const up = b.close >= b.open;
      const color = up ? theme.buy : theme.sell;
      const top = Math.min(openY, closeY);
      const bodyH = Math.max(1, Math.abs(closeY - openY));
      return (
        <React.Fragment key={`${b.time}-${i}`}>
          <Line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1} />
          <Rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={color} />
        </React.Fragment>
      );
    });
  }, [bars, size, theme.buy, theme.sell]);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  }

  return (
    <View style={[styles.wrap, flex && styles.wrapFlex]}>
      <View style={styles.tfRow}>
        {TIMEFRAMES.map((tf) => (
          <Pressable
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={[styles.chip, timeframe === tf && styles.chipActive]}
          >
            <Text style={[styles.chipText, timeframe === tf && styles.chipTextActive]}>{tf}</Text>
          </Pressable>
        ))}
        {lastMid != null ? (
          <Text style={[styles.livePrice, { color: theme.buy }]}>{fmtPrice(lastMid)}</Text>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.chartBox} onLayout={onLayout}>
        {loading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : null}
        {!loading && bars.length > 0 ? (
          <Svg width={size.w} height={size.h}>
            {candles}
          </Svg>
        ) : !loading ? (
          <Text style={[styles.empty, { color: theme.muted }]}>No candle data</Text>
        ) : null}
      </View>
    </View>
  );
}

function useStyles() {
  const { theme } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginBottom: 8 },
        wrapFlex: { flex: 1, marginBottom: 0 },
        tfRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          paddingHorizontal: 4,
        },
        chip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.divider,
        },
        chipActive: { borderColor: theme.buy, backgroundColor: theme.chipActiveBg },
        chipText: { color: theme.muted, fontSize: 11, fontWeight: "700" },
        chipTextActive: { color: theme.text },
        livePrice: { marginLeft: "auto", fontSize: 13, fontWeight: "800" },
        chartBox: {
          flex: 1,
          minHeight: 200,
          borderRadius: 14,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: theme.divider,
          backgroundColor: theme.chartBg,
          alignItems: "center",
          justifyContent: "center",
        },
        loader: { position: "absolute", zIndex: 2 },
        empty: { fontSize: 13 },
        error: { color: theme.error, fontSize: 12, marginBottom: 6, paddingHorizontal: 4 },
      }),
    [theme],
  );
}
