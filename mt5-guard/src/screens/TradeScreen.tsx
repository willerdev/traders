import { useIsFocused } from "@react-navigation/native";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../stores/auth";
import { useMt5Terminal } from "../hooks/use-mt5-terminal";
import {
  mt5AccountModeDetail,
  mt5AccountModeFromSource,
} from "../lib/mt5-account-mode";
import { fmtPrice } from "../lib/format";
import { useTheme } from "../stores/theme";
import { Mt5AccountSummary } from "../components/Mt5AccountSummary";
import { Mt5Paywall } from "../components/Mt5Paywall";
import { Mt5ScreenTitle } from "../components/Mt5ScreenTitle";
import { EmptyState, Screen } from "../components/ui";

export function TradeScreen() {
  const { api, dashboard } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const focused = useIsFocused();
  const tradingActive = dashboard?.user.tradingAccessActive !== false;

  const {
    terminal,
    running,
    loading,
    refreshing,
    error,
    reload,
    reloadRunning,
  } = useMt5Terminal("trades", tradingActive, focused);

  const account = terminal?.account ?? running?.account;
  const accountSource = terminal?.accountSource ?? running?.accountSource;
  const mode = mt5AccountModeFromSource(
    accountSource,
    terminal?.investor?.investmentDeposited,
  );
  const modeDetail = mt5AccountModeDetail(accountSource);

  const trades = running?.trades ?? terminal?.trades ?? [];
  const runningOnly = trades.filter((t) => t.kind === "running" || t.status === "open");

  async function closeTrade(positionId?: string, signalId?: string | null) {
    try {
      if (positionId) await api.signals.closeMt5Position(positionId);
      else if (signalId) await api.signals.closeTrade(signalId);
      await reloadRunning();
      await reload();
    } catch (err) {
      Alert.alert("Close failed", err instanceof Error ? err.message : "Error");
    }
  }

  async function closeAll() {
    Alert.alert("Close all", "Close every open position?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close all",
        style: "destructive",
        onPress: () => {
          void api.signals.closeAllMt5Positions().then(() => {
            void reloadRunning();
            void reload();
          });
        },
      },
    ]);
  }

  if (!tradingActive) {
    return (
      <Screen>
        <Mt5Paywall title="Trade" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Mt5ScreenTitle
        title="Trade"
        mode={mode}
        modeDetail={modeDetail}
        syncing={refreshing}
        showBadge
      />

      <FlatList
        data={runningOnly}
        keyExtractor={(item, i) => item.positionId ?? item.orderId ?? `${item.symbol}-${i}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {account ? (
              <View style={styles.summaryWrap}>
                <Mt5AccountSummary account={account} accountSource={accountSource} />
              </View>
            ) : null}

            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: theme.muted }]}>Open positions</Text>
              {runningOnly.length > 0 ? (
                <Pressable onPress={() => void closeAll()}>
                  <Text style={[styles.closeAll, { color: theme.sell }]}>Close all</Text>
                </Pressable>
              ) : null}
            </View>

            {loading && !terminal ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
            ) : null}
            {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No open positions"
              hint="Use Buy/Sell on the Charts tab to place trades"
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.tradeRow, { borderBottomColor: theme.divider }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.symbol, { color: theme.text }]}>
                {item.symbol} · {item.direction}
              </Text>
              <Text style={[styles.tradeMeta, { color: theme.muted }]}>
                {item.volume != null ? `${item.volume} lot · ` : ""}
                P/L {fmtPrice(item.profit)}
              </Text>
            </View>
            {item.canClose ? (
              <Pressable onPress={() => void closeTrade(item.positionId, item.signalId)}>
                <Text style={[styles.closeBtn, { color: theme.sell }]}>Close</Text>
              </Pressable>
            ) : null}
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
        list: { paddingHorizontal: 20, paddingBottom: 32 },
        summaryWrap: { marginBottom: 12 },
        sectionRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        },
        section: {
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: "700",
        },
        closeAll: { fontWeight: "800", fontSize: 12 },
        tradeRow: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          borderBottomWidth: 1,
        },
        symbol: { fontWeight: "700", fontSize: 15 },
        tradeMeta: { fontSize: 12, marginTop: 2 },
        closeBtn: { fontWeight: "800", fontSize: 13 },
        error: { marginBottom: 8, fontSize: 13 },
      }),
    [theme],
  );
}
