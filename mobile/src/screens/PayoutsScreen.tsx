import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { PrimaryButton, ScreenState, SectionCard } from "../components/ui";
import { formatUsdt, fmtDate, truncateMiddle } from "../lib/format";
import type { PayoutRecord } from "../lib/types";

export function PayoutsScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [items, setItems] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.payouts.history());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function request(payout: PayoutRecord) {
    setBusyId(payout.id);
    try {
      await api.payouts.request(payout.id, payout.walletAddress ?? undefined);
      Alert.alert("Requested", "Payout request submitted");
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenState
        loading={loading}
        error={error}
        empty={!loading && !error && items.length === 0}
        emptyLabel="No payouts yet"
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
          ListHeaderComponent={
            <SectionCard title="Trader split">
              <Text style={{ color: theme.muted, lineHeight: 20 }}>
                Virtual profit is split 40% trader / 60% platform. KYC must be approved before
                payouts are paid.
              </Text>
            </SectionCard>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
              <Text style={{ color: theme.text, fontWeight: "800" }}>
                Week {item.weekNumber}/{item.year} · {item.status}
              </Text>
              <Text style={{ color: theme.muted, marginTop: 6 }}>
                Profit {formatUsdt(item.virtualProfit)} · You {formatUsdt(item.traderShare)} ·
                Platform {formatUsdt(item.platformShare)}
              </Text>
              {item.walletAddress ? (
                <Text style={{ color: theme.muted, marginTop: 4 }}>
                  {truncateMiddle(item.walletAddress)}
                </Text>
              ) : null}
              <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>
                {fmtDate(item.requestedAt)}
                {item.source ? ` · ${item.source}` : ""}
              </Text>
              {item.status === "AVAILABLE" || item.status === "PENDING_REQUEST" ? (
                <View style={{ marginTop: 12 }}>
                  <PrimaryButton
                    label={busyId === item.id ? "…" : "Request payout"}
                    onPress={() => void request(item)}
                    disabled={busyId === item.id}
                  />
                </View>
              ) : null}
            </View>
          )}
        />
      </ScreenState>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
});
