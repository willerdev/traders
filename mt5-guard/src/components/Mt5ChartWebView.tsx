import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useAuth } from "../stores/auth";
import type { UserMt5OhlcBar } from "../lib/types";
import { colors } from "../theme/colors";

const TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"] as const;
export type Mt5ChartTimeframe = (typeof TIMEFRAMES)[number];

function chartHtml(): string {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #chart { width:100%; height:100%; background:#1a1d24; }
</style>
</head><body>
<div id="chart"></div>
<script>
  var chart = LightweightCharts.createChart(document.getElementById('chart'), {
    layout: { background: { color: '#1a1d24' }, textColor: '#9aa4b2' },
    grid: { vertLines: { color: '#2a2f3a' }, horzLines: { color: '#2a2f3a' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2a2f3a' },
    timeScale: { borderColor: '#2a2f3a', timeVisible: true, secondsVisible: false },
  });
  var series = chart.addCandlestickSeries({
    upColor: '#4a9eff', downColor: '#ff5252',
    borderUpColor: '#4a9eff', borderDownColor: '#ff5252',
    wickUpColor: '#4a9eff', wickDownColor: '#ff5252',
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
  document.addEventListener('message', function(e) { handleData(e.data); });
  window.addEventListener('message', function(e) { handleData(e.data); });
</script>
</body></html>`;
}

type Props = {
  symbol: string;
  height?: number;
};

export function Mt5ChartWebView({ symbol, height = 240 }: Props) {
  const { api } = useAuth();
  const webRef = useRef<WebView>(null);
  const [timeframe, setTimeframe] = useState<Mt5ChartTimeframe>("M5");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <View style={[styles.wrap, { height }]}>
      <View style={styles.tfRow}>
        {TIMEFRAMES.map((tf) => (
          <Pressable
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={[styles.chip, timeframe === tf && styles.chipActive]}
          >
            <Text style={styles.chipText}>{tf}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.chartBox}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : null}
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html: chartHtml() }}
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

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  tfRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  chipActive: { borderColor: colors.buy, backgroundColor: "rgba(74,158,255,0.12)" },
  chipText: { color: colors.text, fontSize: 11, fontWeight: "600" },
  chartBox: { flex: 1, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.divider },
  web: { flex: 1, backgroundColor: colors.bg },
  loader: { position: "absolute", alignSelf: "center", top: "40%", zIndex: 2 },
  error: { color: colors.error, fontSize: 12, marginBottom: 6 },
});
