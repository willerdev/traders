import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { fmtPrice } from "../lib/format";
import {
  TIMEFRAME_SECONDS,
  alignedBarTime,
  mergeLiveTick,
  mergeRecentBars,
  sanitizeOhlcBars,
  type ChartTimeframe,
  type OhlcBar,
} from "../lib/chart-ohlc";

const TIMEFRAMES: ChartTimeframe[] = ["M1", "M5", "M15", "H1", "H4", "D1"];
/** Visible candles — fewer = clearer step-by-step movement */
const VISIBLE_BARS = 72;
const QUOTE_TICK_MS = 400;
const OHLC_SYNC_MS = 12_000;

type Props = {
  symbol: string;
  flex?: boolean;
  active?: boolean;
};

export function Mt5NativeChart({ symbol, flex, active = true }: Props) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("M1");
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 300, h: 240 });
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [mid, setMid] = useState<number | null>(null);
  const [tickDir, setTickDir] = useState<"up" | "down" | "flat">("flat");

  const barsRef = useRef<OhlcBar[]>([]);
  const midRef = useRef<number | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    barsRef.current = bars;
  }, [bars]);

  const loadFullHistory = useCallback(async () => {
    try {
      const res = await api.signals.mt5Ohlc(symbol, timeframe, 160);
      const next = sanitizeOhlcBars(symbol, res.bars ?? []);
      setBars(next);
      barsRef.current = next;
      if (next.length > 0) {
        const last = next[next.length - 1].close;
        setMid(last);
        midRef.current = last;
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chart load failed");
    } finally {
      setLoading(false);
    }
  }, [api, symbol, timeframe]);

  /** Soft sync — merge only latest bars so the live candle keeps stepping. */
  const syncRecentBars = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const res = await api.signals.mt5Ohlc(symbol, timeframe, 4);
      const remote = sanitizeOhlcBars(symbol, res.bars ?? []);
      if (remote.length === 0) return;
      setBars((prev) => {
        const merged = mergeRecentBars(prev, remote);
        barsRef.current = merged;
        return merged;
      });
    } catch {
      /* keep live ticks */
    } finally {
      syncingRef.current = false;
    }
  }, [api, symbol, timeframe]);

  useEffect(() => {
    setLoading(true);
    setBars([]);
    barsRef.current = [];
    setBid(null);
    setAsk(null);
    setMid(null);
    midRef.current = null;
    setTickDir("flat");
    void loadFullHistory();
  }, [loadFullHistory]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void syncRecentBars(), OHLC_SYNC_MS);
    return () => clearInterval(id);
  }, [active, syncRecentBars]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const intervalSec = TIMEFRAME_SECONDS[timeframe];

    async function tickQuote() {
      try {
        const q = await api.signals.mt5Quote(symbol);
        if (cancelled) return;
        const price = q.mid ?? ((q.bid ?? 0) + (q.ask ?? 0)) / 2;
        if (!Number.isFinite(price) || price <= 0) return;

        const prevMid = midRef.current;
        if (prevMid != null) {
          if (price > prevMid) setTickDir("up");
          else if (price < prevMid) setTickDir("down");
          else setTickDir("flat");
        }
        midRef.current = price;
        setMid(price);
        setBid(q.bid ?? null);
        setAsk(q.ask ?? null);

        const nowSec = Math.floor(Date.now() / 1000);
        const barTime = alignedBarTime(nowSec, intervalSec);

        setBars((prev) => {
          const last = prev.length > 0 ? prev[prev.length - 1] : null;
          const nextBar = mergeLiveTick(symbol, last, barTime, price);
          if (!last) {
            const next = [nextBar];
            barsRef.current = next;
            return next;
          }
          if (nextBar.time === last.time) {
            if (
              nextBar.close === last.close &&
              nextBar.high === last.high &&
              nextBar.low === last.low
            ) {
              return prev;
            }
            const next = [...prev];
            next[next.length - 1] = nextBar;
            barsRef.current = next;
            return next;
          }
          if (nextBar.time > last.time) {
            const next = [...prev, nextBar];
            barsRef.current = next;
            return next;
          }
          return prev;
        });
      } catch {
        /* keep last tick */
      }
    }

    void tickQuote();
    const id = setInterval(() => void tickQuote(), QUOTE_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, api, symbol, timeframe]);

  const visible = useMemo(() => {
    if (bars.length <= VISIBLE_BARS) return bars;
    return bars.slice(-VISIBLE_BARS);
  }, [bars]);

  const chartGeom = useMemo(() => {
    if (visible.length === 0 || size.w < 20 || size.h < 40) return null;
    const padL = 4;
    const padR = 52;
    const padT = 10;
    const padB = 8;
    const w = size.w - padL - padR;
    const h = size.h - padT - padB;
    const lows = visible.map((b) => b.low);
    const highs = visible.map((b) => b.high);
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    if (mid != null) {
      min = Math.min(min, mid);
      max = Math.max(max, mid);
    }
    // Pad range so small ticks still read as movement
    const span = max - min || Math.abs(max) * 0.001 || 1;
    const pad = span * 0.08;
    min -= pad;
    max += pad;
    const range = max - min;
    const slot = w / visible.length;
    const bodyW = Math.max(2, slot * 0.6);
    const y = (v: number) => padT + h - ((v - min) / range) * h;

    const candles = visible.map((b, i) => {
      const x = padL + i * slot + slot / 2;
      const openY = y(b.open);
      const closeY = y(b.close);
      const highY = y(b.high);
      const lowY = y(b.low);
      const up = b.close >= b.open;
      const color = up ? theme.buy : theme.sell;
      const top = Math.min(openY, closeY);
      const bodyH = Math.max(1.5, Math.abs(closeY - openY));
      return { key: `${b.time}-${i}`, x, highY, lowY, top, bodyH, bodyW, color };
    });

    const priceY = mid != null ? y(mid) : null;
    const liveColor =
      tickDir === "up" ? theme.buy : tickDir === "down" ? theme.sell : theme.muted;

    return { candles, priceY, liveColor, padL, padR, w };
  }, [visible, size, mid, theme.buy, theme.sell, theme.muted, tickDir]);

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize((prev) =>
        Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
          ? prev
          : { w: width, h: height },
      );
    }
  }

  const liveColor =
    tickDir === "up" ? theme.buy : tickDir === "down" ? theme.sell : theme.text;

  return (
    <View style={[styles.wrap, flex && styles.wrapFlex]}>
      <View style={styles.tfRow}>
        {TIMEFRAMES.map((tf) => (
          <Pressable
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={[styles.chip, timeframe === tf && styles.chipActive]}
          >
            <Text style={[styles.chipText, timeframe === tf && styles.chipTextActive]}>
              {tf}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.quoteRow}>
        <Text style={[styles.quoteSym, { color: theme.text }]}>{symbol}</Text>
        <View style={styles.quotePrices}>
          <Text style={[styles.quoteBid, { color: theme.sell }]}>
            {bid != null ? fmtPrice(bid) : "—"}
          </Text>
          <Text style={[styles.quoteMid, { color: liveColor }]}>
            {mid != null ? fmtPrice(mid) : "—"}
          </Text>
          <Text style={[styles.quoteAsk, { color: theme.buy }]}>
            {ask != null ? fmtPrice(ask) : "—"}
          </Text>
        </View>
        <View
          style={[
            styles.liveDot,
            {
              backgroundColor:
                tickDir === "up"
                  ? theme.buy
                  : tickDir === "down"
                    ? theme.sell
                    : theme.muted,
            },
          ]}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.chartBox} onLayout={onLayout}>
        {loading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : null}
        {!loading && chartGeom ? (
          <Svg width={size.w} height={size.h}>
            {chartGeom.candles.map((c) => (
              <React.Fragment key={c.key}>
                <Line
                  x1={c.x}
                  y1={c.highY}
                  x2={c.x}
                  y2={c.lowY}
                  stroke={c.color}
                  strokeWidth={1.25}
                />
                <Rect
                  x={c.x - c.bodyW / 2}
                  y={c.top}
                  width={c.bodyW}
                  height={c.bodyH}
                  fill={c.color}
                />
              </React.Fragment>
            ))}
            {chartGeom.priceY != null && mid != null ? (
              <>
                <Line
                  x1={chartGeom.padL}
                  y1={chartGeom.priceY}
                  x2={chartGeom.padL + chartGeom.w}
                  y2={chartGeom.priceY}
                  stroke={chartGeom.liveColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.85}
                />
                <SvgText
                  x={size.w - 4}
                  y={chartGeom.priceY + 4}
                  fill={chartGeom.liveColor}
                  fontSize={10}
                  fontWeight="700"
                  textAnchor="end"
                >
                  {fmtPrice(mid)}
                </SvgText>
              </>
            ) : null}
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
        quoteRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 4,
          marginBottom: 8,
        },
        quoteSym: { fontSize: 13, fontWeight: "800" },
        quotePrices: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 10 },
        quoteBid: { fontSize: 13, fontWeight: "700" },
        quoteMid: { fontSize: 16, fontWeight: "800" },
        quoteAsk: { fontSize: 13, fontWeight: "700" },
        liveDot: { width: 8, height: 8, borderRadius: 4 },
        chartBox: {
          flex: 1,
          minHeight: 220,
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
        error: {
          color: theme.error,
          fontSize: 12,
          marginBottom: 6,
          paddingHorizontal: 4,
        },
      }),
    [theme],
  );
}
