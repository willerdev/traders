import { useIsFocused } from "@react-navigation/native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../stores/auth";
import { useMt5Terminal } from "../hooks/use-mt5-terminal";
import { formatCurrency } from "../lib/format";
import { useTheme } from "../stores/theme";
import { Mt5Paywall } from "../components/Mt5Paywall";
import { Mt5ScreenTitle } from "../components/Mt5ScreenTitle";
import { EmptyState, Screen } from "../components/ui";

export function HistoryScreen() {
  const { dashboard } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const focused = useIsFocused();
  const tradingActive = dashboard?.user.tradingAccessActive !== false;
  const [historyTab, setHistoryTab] = useState<"positions" | "orders" | "deals">("positions");

  const { terminal, loading, refreshing, error } = useMt5Terminal(
    "history",
    tradingActive,
    focused,
  );

  if (!tradingActive) {
    return (
      <Screen>
        <Mt5Paywall title="History" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Mt5ScreenTitle
        title="History"
        syncing={refreshing}
      />

      <View style={styles.tabs}>
        {(["positions", "orders", "deals"] as const).map((h) => (
          <Pressable
            key={h}
            onPress={() => setHistoryTab(h)}
            style={[
              styles.chip,
              { borderColor: theme.divider },
              historyTab === h && { borderColor: theme.buy, backgroundColor: theme.chipActiveBg },
            ]}
          >
            <Text style={[styles.chipText, { color: theme.text }]}>{h.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !terminal ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
      ) : null}
      {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

      <FlatList
        data={terminal?.history.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="No history yet" />}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: theme.divider }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.symbol, { color: theme.text }]}>
                {item.symbol} · {item.status}
              </Text>
              <Text style={[styles.meta, { color: theme.muted }]}>
                {item.pnl != null ? formatCurrency(item.pnl) : "—"}
              </Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

function useStyles() {
  const { theme } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 8 },
        chip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1,
        },
        chipText: { fontSize: 11, fontWeight: "700" },
        list: { paddingHorizontal: 20, paddingBottom: 32 },
        row: {
          paddingVertical: 14,
          borderBottomWidth: 1,
        },
        symbol: { fontWeight: "700", fontSize: 15 },
        meta: { fontSize: 12, marginTop: 2 },
        error: { paddingHorizontal: 20, fontSize: 13 },
      }),
    [theme],
  );
}
