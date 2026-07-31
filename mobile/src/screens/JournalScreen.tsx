import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { ProgressBar, ScreenState, SectionCard } from "../components/ui";
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

  const stats = useMemo(() => {
    const total = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const avgYield =
      items.length > 0
        ? items.reduce((sum, row) => sum + Number(row.yieldPercent || 0), 0) / items.length
        : 0;
    const last = items[0];
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthTotal = items
      .filter((row) => String(row.creditDate || "").startsWith(monthKey))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const target = Math.max(total * 1.25, total + 50, 100);
    return {
      total,
      avgYield,
      last,
      monthTotal,
      count: items.length,
      progress: total > 0 ? Math.min(total / target, 1) : 0,
    };
  }, [items]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <Text style={[styles.title, { color: theme.text }]}>Journal</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>Income target & daily credits</Text>

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
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <SectionCard>
                <Text style={{ color: theme.muted, fontWeight: "700", fontSize: 13 }}>
                  Total earned
                </Text>
                <Text style={[styles.heroAmount, { color: theme.text }]}>
                  {formatUsdt(stats.total)}
                </Text>
                <Text style={{ color: theme.muted, marginTop: 8, marginBottom: 14, fontSize: 13 }}>
                  Progress toward your next income target
                </Text>
                <ProgressBar progress={stats.progress} />
              </SectionCard>

              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>Entries</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stats.count}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>Avg yield</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.avgYield.toFixed(1)}%
                  </Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>This month</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {formatUsdt(stats.monthTotal)}
                  </Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>Last credit</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.last ? formatUsdt(stats.last.amount) : "—"}
                  </Text>
                </View>
              </View>

              <Text style={[styles.sectionLabel, { color: theme.text }]}>Recent credits</Text>
            </View>
          }
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
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          renderItem={({ item }) => (
            <View
              style={[
                styles.rowCard,
                { backgroundColor: theme.surface, borderColor: theme.divider },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>
                  {item.source} · Day {item.dayIndex ?? "—"}
                </Text>
                <Text style={{ color: theme.muted, marginTop: 6, fontSize: 12, lineHeight: 18 }}>
                  {fmtDay(item.creditDate)} · {item.yieldPercent}% on {formatUsdt(item.baseBalance)}
                </Text>
              </View>
              <Text style={{ color: theme.primary, fontWeight: "900", fontSize: 16 }}>
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
    fontSize: 32,
    fontWeight: "900",
    paddingHorizontal: 24,
    paddingTop: 8,
    letterSpacing: -0.8,
  },
  sub: { fontSize: 14, paddingHorizontal: 24, marginTop: 6, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  headerBlock: { marginBottom: 8 },
  heroAmount: {
    fontSize: 40,
    fontWeight: "900",
    marginTop: 10,
    letterSpacing: -1.4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 28,
  },
  statCard: {
    width: "47.5%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    minHeight: 96,
    justifyContent: "space-between",
  },
  statValue: { fontSize: 20, fontWeight: "900", marginTop: 12, letterSpacing: -0.4 },
  sectionLabel: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
});
