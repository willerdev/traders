import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { ScreenState } from "../../components/ui";
import { formatUsdt, fmtDate } from "../../lib/format";
import type { WalletLedgerItem } from "../../lib/types";

export function TransactionsScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [items, setItems] = useState<WalletLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.wallet.transactions(50, 0);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenState
        loading={loading}
        error={error}
        empty={!loading && !error && items.length === 0}
        emptyLabel="No transactions yet"
        onRetry={() => void load()}
      >
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={theme.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "700" }}>{item.description || item.type}</Text>
                <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>{fmtDate(item.createdAt)}</Text>
              </View>
              <Text
                style={{
                  color: theme.text,
                  fontWeight: "800",
                }}
              >
                {item.amount >= 0 ? "+" : ""}
                {formatUsdt(item.amount)}
              </Text>
            </View>
          )}
        />
      </ScreenState>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
});
