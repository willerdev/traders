import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { ScreenState } from "../components/ui";
import { formatUsdt, fmtDay } from "../lib/format";
import type { DailyIncomeEntry } from "../lib/types";

export function JournalScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [items, setItems] = useState<DailyIncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.wallet.incomeJournal(60, 0);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journal");
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <Text style={[styles.title, { color: theme.text }]}>Journal</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>Income & investment returns</Text>
      <ScreenState
        loading={loading}
        error={error}
        empty={!loading && !error && items.length === 0}
        emptyLabel="No income credits yet"
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
                <Text style={{ color: theme.text, fontWeight: "700" }}>
                  {item.source} · Day {item.dayIndex ?? "—"}
                </Text>
                <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>
                  {fmtDay(item.creditDate)} · {item.yieldPercent}% on {formatUsdt(item.baseBalance)}
                </Text>
              </View>
              <Text style={{ color: theme.primary, fontWeight: "800" }}>
                +{formatUsdt(item.amount)}
              </Text>
            </View>
          )}
        />
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: "800",
    paddingHorizontal: 20,
    paddingTop: 8,
    letterSpacing: -0.4,
  },
  sub: { fontSize: 13, paddingHorizontal: 20, marginTop: 4, marginBottom: 4 },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
});
