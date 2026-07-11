import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "../stores/auth";
import { useMt5Symbol } from "../contexts/mt5-symbol";
import { useMt5Terminal } from "../hooks/use-mt5-terminal";
import { useTheme } from "../stores/theme";
import { Mt5NativeChart } from "../components/Mt5NativeChart";
import { Mt5Paywall } from "../components/Mt5Paywall";
import { Mt5TradeHeader } from "../components/Mt5TradeHeader";
import { PlaceOrderModal } from "../components/PlaceOrderModal";
import { Screen } from "../components/ui";
import type { MainTabParamList } from "../navigation/types";

const SYMBOLS = ["1HZ75V", "BTCUSD", "XAUUSD", "EURUSD", "GBPUSD", "NAS100"];
const TRADE_BAR_KEY = "mt5-guard-chart-trade-bar";

export function ChartsScreen() {
  const { dashboard } = useAuth();
  const { theme } = useTheme();
  const { symbol, setSymbol } = useMt5Symbol();
  const styles = useStyles();
  const focused = useIsFocused();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const tradingActive = dashboard?.user.tradingAccessActive !== false;

  const { loading, refreshing, error, reloadRunning, reload } = useMt5Terminal(
    "chart",
    tradingActive,
    focused,
  );

  const [showTradeBar, setShowTradeBar] = useState(true);
  const [orderDir, setOrderDir] = useState<"BUY" | "SELL" | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await SecureStore.getItemAsync(TRADE_BAR_KEY);
      if (stored === "0") setShowTradeBar(false);
      if (stored === "1") setShowTradeBar(true);
    })();
  }, []);

  const toggleTradeBar = useCallback(() => {
    setShowTradeBar((prev) => {
      const next = !prev;
      void SecureStore.setItemAsync(TRADE_BAR_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  if (!tradingActive) {
    return (
      <Screen>
        <Mt5Paywall title="Charts" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        {refreshing ? (
          <Text style={[styles.sync, { color: theme.primary }]}>· syncing</Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          onPress={toggleTradeBar}
          style={[
            styles.toggleBtn,
            {
              backgroundColor: showTradeBar ? theme.chipActiveBg : theme.surfaceAlt,
              borderColor: showTradeBar ? theme.buy : theme.divider,
            },
          ]}
          hitSlop={8}
        >
          <Ionicons
            name={showTradeBar ? "eye" : "eye-off"}
            size={18}
            color={showTradeBar ? theme.buy : theme.muted}
          />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={[styles.gear, { backgroundColor: theme.surfaceAlt, borderColor: theme.divider }]}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={theme.muted} />
        </Pressable>
      </View>

      <View style={styles.symbolBlock}>
        <Text style={[styles.symbolTitle, { color: theme.text }]}>{symbol}</Text>
        <View style={styles.symbolPicker}>
          {SYMBOLS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSymbol(s)}
              style={[
                styles.chip,
                { borderColor: theme.divider },
                symbol === s && { borderColor: theme.buy, backgroundColor: theme.chipActiveBg },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 16 }} />
      ) : null}
      {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

      <View style={styles.chartArea}>
        <Mt5NativeChart symbol={symbol} flex active={focused} />
      </View>

      {showTradeBar ? (
        <View style={styles.tradeBar}>
          <Mt5TradeHeader
            symbol={symbol}
            active={focused}
            onBuy={() => setOrderDir("BUY")}
            onSell={() => setOrderDir("SELL")}
          />
        </View>
      ) : null}

      {orderDir ? (
        <PlaceOrderModal
          visible
          symbol={symbol}
          direction={orderDir}
          onClose={() => setOrderDir(null)}
          onPlaced={() => {
            void reloadRunning();
            void reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

function useStyles() {
  const { theme } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        topBar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 4,
          gap: 8,
        },
        sync: { flex: 1, fontSize: 11, fontWeight: "600" },
        toggleBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        gear: {
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        symbolBlock: { paddingHorizontal: 20, marginBottom: 6 },
        symbolTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
        symbolPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        chip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
        },
        chipText: { fontSize: 12, fontWeight: "700" },
        chartArea: { flex: 1, paddingHorizontal: 12, minHeight: 200 },
        tradeBar: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4 },
        error: { paddingHorizontal: 20, paddingVertical: 6, fontSize: 13 },
      }),
    [theme],
  );
}
