import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import type { UserMt5OhlcBar } from "../lib/types";

const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"] as const;
export type Mt5ChartTimeframe = (typeof TIMEFRAMES)[number];

function chartHtml(bg: string, grid: string, text: string, buy: string, sell: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #chart { width:100%; height:100%; background:${bg}; }
</style>
</head><body>
<div id="chart"></div>
<script>
  var chart = LightweightCharts.createChart(document.getElementById('chart'), {
    layout: { background: { color: '${bg}' }, textColor: '${text}' },
    grid: { vertLines: { color: '${grid}' }, horzLines: { color: '${grid}' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '${grid}' },
    timeScale: { borderColor: '${grid}', timeVisible: true, secondsVisible: false },
  });
  var series = chart.addCandlestickSeries({
    upColor: '${buy}', downColor: '${sell}',
    borderUpColor: '${buy}', borderDownColor: '${sell}',
    wickUpColor: '${buy}', wickDownColor: '${sell}',
  });
  function resize() {
    var el = document.getElementById('chart');
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  }
  window.addEventListener('resize', resize);
  resize();
  function handleData(raw) {
    try {
      var payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!payload || !payload.bars) return;
      series.setData(payload.bars.map(function(b) {
        return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
      }));
      chart.timeScale().fitContent();
    } catch (err) {}
  }
  window.setChartBars = function(raw) { handleData(raw); };
</script>
</body></html>`;
}

type Props = {
  symbol: string;
  height?: number;
  flex?: boolean;
};

export function Mt5ChartWebView({ symbol, height = 280, flex }: Props) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const webRef = useRef<WebView>(null);
  const [timeframe, setTimeframe] = useState<Mt5ChartTimeframe>("M5");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const html = useMemo(
    () => chartHtml(theme.chartBg, theme.chartGrid, theme.chartText, theme.buy, theme.sell),
    [theme],
  );

  const pushBars = useCallback((bars: UserMt5OhlcBar[]) => {
    const json = JSON.stringify({ bars });
    webRef.current?.injectJavaScript(
      `window.setChartBars && window.setChartBars(${JSON.stringify(json)}); true;`,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await api.signals.mt5Ohlc(symbol, timeframe, 200);
        if (!cancelled) pushBars(res.bars ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Chart load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, symbol, timeframe, pushBars]);

  return (
    <View style={[styles.wrap, flex ? styles.wrapFlex : { height }]}>
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
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.chartBox}>
        {loading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : null}
        <WebView
          key={theme.mode}
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={styles.web}
          scrollEnabled={false}
          onLoadEnd={() => {
            void api.signals.mt5Ohlc(symbol, timeframe, 200).then((res) => {
              pushBars(res.bars ?? []);
            });
          }}
        />
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
        tfRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
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
        chartBox: {
          flex: 1,
          borderRadius: 14,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: theme.divider,
        },
        web: { flex: 1, backgroundColor: theme.chartBg },
        loader: { position: "absolute", alignSelf: "center", top: "40%", zIndex: 2 },
        error: { color: theme.error, fontSize: 12, marginBottom: 6 },
      }),
    [theme],
  );
}
