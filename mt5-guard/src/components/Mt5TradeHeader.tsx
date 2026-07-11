import { useEffect, useState } from "react";
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

export function Mt5TradeHeader({ symbol, onBuy, onSell, active }: Props) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [volume, setVolume] = useState<string>("—");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function load() {
      try {
        const [quote, preview] = await Promise.all([
          api.signals.mt5Quote(symbol),
          api.signals.mt5OrderPreview(symbol, "BUY").catch(() => null),
        ]);
        if (cancelled) return;
        setBid(quote.bid);
        setAsk(quote.ask);
        if (preview?.risk?.volume != null) {
          setVolume(String(preview.risk.volume));
        }
      } catch {
        /* keep last */
      }
    }

    void load();
    const id = setInterval(() => void load(), 800);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, api, symbol]);

  const btnColor = theme.mode === "light" ? "#2563eb" : theme.buy;

  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
      <Pressable
        onPress={onSell}
        style={[styles.sideBtn, { backgroundColor: theme.sell }]}
      >
        <Text style={styles.sideLabel}>SELL</Text>
        <Text style={styles.sidePrice}>
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

      <Pressable
        onPress={onBuy}
        style={[styles.sideBtn, { backgroundColor: btnColor }]}
      >
        <Text style={styles.sideLabel}>BUY</Text>
        <Text style={styles.sidePrice}>
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
