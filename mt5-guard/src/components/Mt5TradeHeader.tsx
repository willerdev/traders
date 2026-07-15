import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../stores/auth";
import { fmtPrice } from "../lib/format";
import { useTheme } from "../stores/theme";

type Props = {
  symbol: string;
  onBuy: () => void;
  onSell: () => void;
  active: boolean;
};

const QUOTE_MS = 400;
const PREVIEW_MS = 8_000;

export function Mt5TradeHeader({ symbol, onBuy, onSell, active }: Props) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [volume, setVolume] = useState<string>("—");
  const [tickDir, setTickDir] = useState<"up" | "down" | "flat">("flat");
  const midRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    midRef.current = null;
    setBid(null);
    setAsk(null);
    setTickDir("flat");

    async function loadQuote() {
      try {
        const quote = await api.signals.mt5Quote(symbol);
        if (cancelled) return;
        const mid = quote.mid ?? ((quote.bid ?? 0) + (quote.ask ?? 0)) / 2;
        const prev = midRef.current;
        if (prev != null && Number.isFinite(mid)) {
          if (mid > prev) setTickDir("up");
          else if (mid < prev) setTickDir("down");
        }
        midRef.current = mid;
        setBid(quote.bid);
        setAsk(quote.ask);
      } catch {
        /* keep last */
      }
    }

    async function loadPreview() {
      try {
        const preview = await api.signals.mt5OrderPreview(symbol, "BUY");
        if (cancelled) return;
        if (preview?.risk?.volume != null) {
          setVolume(String(preview.risk.volume));
        }
      } catch {
        /* keep last */
      }
    }

    void loadQuote();
    void loadPreview();
    const quoteId = setInterval(() => void loadQuote(), QUOTE_MS);
    const previewId = setInterval(() => void loadPreview(), PREVIEW_MS);
    return () => {
      cancelled = true;
      clearInterval(quoteId);
      clearInterval(previewId);
    };
  }, [active, api, symbol]);

  const btnColor = theme.mode === "light" ? "#2563eb" : theme.buy;
  const flash =
    tickDir === "up" ? theme.buy : tickDir === "down" ? theme.sell : undefined;

  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
      <Pressable onPress={onSell} style={[styles.sideBtn, { backgroundColor: theme.sell }]}>
        <Text style={styles.sideLabel}>SELL</Text>
        <Text style={[styles.sidePrice, flash === theme.sell && styles.flash]}>
          {bid != null ? fmtPrice(bid) : "—"}
        </Text>
      </Pressable>

      <View style={[styles.lotBox, { borderColor: theme.divider, backgroundColor: theme.bg }]}>
        <Text style={[styles.lotLabel, { color: theme.muted }]}>LOT</Text>
        {volume === "—" ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <Text style={[styles.lotValue, { color: theme.text }]}>{volume}</Text>
        )}
      </View>

      <Pressable onPress={onBuy} style={[styles.sideBtn, { backgroundColor: btnColor }]}>
        <Text style={styles.sideLabel}>BUY</Text>
        <Text style={[styles.sidePrice, flash === theme.buy && styles.flash]}>
          {ask != null ? fmtPrice(ask) : "—"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  sideBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  sideLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    opacity: 0.9,
  },
  sidePrice: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  flash: {
    textShadowColor: "rgba(255,255,255,0.55)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  lotBox: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingVertical: 8,
  },
  lotLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  lotValue: { fontSize: 16, fontWeight: "800", marginTop: 2 },
});
