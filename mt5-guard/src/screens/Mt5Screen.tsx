import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { useAuth } from "../stores/auth";
import { WEB_APP_URL } from "../config/env";
import { useMt5Terminal, type Mt5SubTab } from "../hooks/use-mt5-terminal";
import {
  mt5AccountModeDetail,
  mt5AccountModeFromSource,
} from "../lib/mt5-account-mode";
import { fmtPrice, formatCurrency } from "../lib/format";
import { colors } from "../theme/colors";
import { Mt5AccountModeBadge } from "../components/Mt5AccountModeBadge";
import { Mt5ChartWebView } from "../components/Mt5ChartWebView";
import { PlaceOrderModal } from "../components/PlaceOrderModal";
import { Card, EmptyState, PrimaryButton, Screen } from "../components/ui";

const SUB_TABS: { id: Mt5SubTab; label: string }[] = [
  { id: "quotes", label: "Quotes" },
  { id: "chart", label: "Charts" },
  { id: "trades", label: "Trade" },
  { id: "history", label: "History" },
];

export function Mt5Screen() {
  const { api, dashboard } = useAuth();
  const [subTab, setSubTab] = useState<Mt5SubTab>("chart");
  const tradingActive = dashboard?.user.tradingAccessActive !== false;
  const {
    terminal,
    running,
    quotes,
    loading,
    refreshing,
    error,
    reload,
    reloadRunning,
  } = useMt5Terminal(subTab, tradingActive);

  const [orderDir, setOrderDir] = useState<"BUY" | "SELL" | null>(null);
  const [chartSymbol, setChartSymbol] = useState("XAUUSD");
  const [historyTab, setHistoryTab] = useState<"positions" | "orders" | "deals">("positions");

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
        <View style={styles.paywall}>
          <Text style={styles.title}>MT5</Text>
          <Text style={styles.paywallText}>
            Weekly trading access required. Renew on the web to unlock MT5.
          </Text>
          <PrimaryButton
            label="Renew on web"
            onPress={() => void Linking.openURL(`${WEB_APP_URL}/dashboard`)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {subTab === "history" ? "History" : subTab === "quotes" ? "Quotes" : subTab === "trades" ? "Trade" : "Charts"}
          </Text>
          <Mt5AccountModeBadge mode={mode} detail={modeDetail} />
        </View>
        {refreshing ? <Text style={styles.sync}>· syncing</Text> : null}
      </View>

      {account && subTab !== "quotes" ? (
        <Card>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Balance</Text>
            <Text style={styles.accountValue}>
              {fmtPrice(
                accountSource && accountSource !== "virtual"
                  ? account.startingBalance
                  : account.startingBalance + account.realizedProfit,
              )}
            </Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Equity</Text>
            <Text style={styles.accountValue}>{fmtPrice(account.equity)}</Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Floating</Text>
            <Text style={[styles.accountValue, account.floatingProfit >= 0 ? styles.pos : styles.neg]}>
              {fmtPrice(account.floatingProfit)}
            </Text>
          </View>
        </Card>
      ) : null}

      <View style={styles.subTabs}>
        {SUB_TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setSubTab(t.id)}
            style={[styles.subTab, subTab === t.id && styles.subTabActive]}
          >
            <Text style={[styles.subTabText, subTab === t.id && styles.subTabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && !terminal ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {subTab === "quotes" && (
        <FlatList
          data={quotes?.items ?? []}
          keyExtractor={(item) => item.signalId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No setup quotes" hint="Open setups appear here" />}
          renderItem={({ item }) => (
            <View style={styles.quoteRow}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <Text style={styles.quoteMid}>{fmtPrice(item.mid)}</Text>
              <Text style={styles.quoteSide}>
                {fmtPrice(item.bid)} / {fmtPrice(item.ask)}
              </Text>
            </View>
          )}
        />
      )}

      {subTab === "chart" && (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.chartSymbol}>{chartSymbol}</Text>
          <View style={styles.symbolPicker}>
            {["XAUUSD", "EURUSD", "GBPUSD", "NAS100"].map((s) => (
              <Pressable
                key={s}
                onPress={() => setChartSymbol(s)}
                style={[styles.chip, chartSymbol === s && styles.chipActive]}
              >
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chartPlaceholder}>
            <Mt5ChartWebView symbol={chartSymbol} height={260} />
          </View>
          <View style={styles.orderBar}>
            <PrimaryButton label="Buy" onPress={() => setOrderDir("BUY")} color={colors.buy} />
            <PrimaryButton label="Sell" onPress={() => setOrderDir("SELL")} color={colors.sell} />
          </View>
        </ScrollView>
      )}

      {subTab === "trades" && (
        <FlatList
          data={runningOnly}
          keyExtractor={(item, i) => item.positionId ?? item.orderId ?? `${item.symbol}-${i}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            runningOnly.length > 0 ? (
              <Pressable onPress={() => void closeAll()} style={styles.closeAll}>
                <Text style={styles.closeAllText}>Close all</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<EmptyState title="No open positions" />}
          renderItem={({ item }) => (
            <View style={styles.tradeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.symbol}>
                  {item.symbol} · {item.direction}
                </Text>
                <Text style={styles.tradeMeta}>
                  {item.volume != null ? `${item.volume} lot · ` : ""}
                  P/L {fmtPrice(item.profit)}
                </Text>
              </View>
              {item.canClose ? (
                <Pressable
                  onPress={() =>
                    void closeTrade(item.positionId, item.signalId)
                  }
                >
                  <Text style={styles.closeBtn}>Close</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      {subTab === "history" && (
        <View style={{ flex: 1 }}>
          <View style={styles.historyTabs}>
            {(["positions", "orders", "deals"] as const).map((h) => (
              <Pressable
                key={h}
                onPress={() => setHistoryTab(h)}
                style={[styles.chip, historyTab === h && styles.chipActive]}
              >
                <Text style={styles.chipText}>{h.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            data={terminal?.history.items ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<EmptyState title="No history yet" />}
            renderItem={({ item }) => (
              <View style={styles.tradeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.symbol}>
                    {item.symbol} · {item.status}
                  </Text>
                  <Text style={styles.tradeMeta}>
                    {item.pnl != null ? formatCurrency(item.pnl) : "—"}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {orderDir ? (
        <PlaceOrderModal
          visible
          symbol={chartSymbol}
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

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  sync: { color: colors.primary, fontSize: 11, marginTop: 4 },
  subTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginTop: 8,
  },
  subTab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  subTabActive: { borderBottomWidth: 2, borderBottomColor: colors.buy },
  subTabText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  subTabTextActive: { color: colors.text },
  list: { padding: 16, paddingBottom: 32 },
  quoteRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  symbol: { color: colors.text, fontWeight: "700", fontSize: 15 },
  quoteMid: { color: colors.text, fontSize: 18, fontWeight: "600", marginTop: 4 },
  quoteSide: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chartSymbol: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  symbolPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  chipActive: { borderColor: colors.buy, backgroundColor: "rgba(74,158,255,0.12)" },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chartPlaceholder: {
    minHeight: 280,
    marginBottom: 4,
  },
  orderBar: { flexDirection: "row", gap: 10, marginTop: 16 },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tradeMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  closeBtn: { color: colors.sell, fontWeight: "700" },
  closeAll: { alignSelf: "flex-end", marginBottom: 8 },
  closeAllText: { color: colors.sell, fontWeight: "700", fontSize: 12 },
  accountRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  accountLabel: { color: colors.muted, fontSize: 13 },
  accountValue: { color: colors.text, fontWeight: "600" },
  pos: { color: colors.buy },
  neg: { color: colors.sell },
  error: { color: colors.error, padding: 16 },
  paywall: { flex: 1, padding: 24, justifyContent: "center" },
  paywallText: { color: colors.muted, marginVertical: 16, lineHeight: 22 },
  historyTabs: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
});
