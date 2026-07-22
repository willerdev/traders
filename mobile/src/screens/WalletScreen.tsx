import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import {
  ActionIconButton,
  ListRow,
  ScreenState,
  SectionCard,
} from "../components/ui";
import { formatMoney } from "../lib/format";
import type { DisplayCurrencyInfo, WalletSummary } from "../lib/types";
import type { WalletStackParamList } from "../navigation/types";

export function WalletScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<WalletStackParamList>>();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [display, setDisplay] = useState<DisplayCurrencyInfo | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [currencyBusy, setCurrencyBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [wallet, settings] = await Promise.all([
        api.wallet.summary(),
        api.users.settings().catch(() => null),
      ]);
      setSummary(wallet);
      setDisplay(wallet.displayCurrency ?? settings?.displayCurrency ?? null);
      setLocalCode(
        wallet.displayCurrency?.localCurrencyCode ??
          settings?.displayCurrency?.localCurrencyCode ??
          null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const available = summary?.availableBalance ?? 0;
  const locked = summary?.lockedBalance ?? 0;
  const total = available + locked;
  const showingLocal =
    Boolean(localCode) && display?.code?.toUpperCase() === localCode?.toUpperCase();
  const mask = (v: number) => (hideBalance ? "••••••" : formatMoney(v, display));

  async function setCurrency(mode: "USDT" | "LOCAL") {
    if (currencyBusy) return;
    if (mode === "LOCAL" && !localCode) {
      Alert.alert("Local currency", "Set your country in web Settings first to enable local display.");
      return;
    }
    setCurrencyBusy(true);
    try {
      await api.users.updateCurrency(mode === "USDT" ? "USDT" : "LOCAL");
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not update currency");
    } finally {
      setCurrencyBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={styles.topBar}>
        <Text style={[styles.title, { color: theme.text }]}>Assets</Text>
        <View style={styles.topActions}>
          <View style={[styles.currencySwitch, { borderColor: theme.divider, backgroundColor: theme.surface }]}>
            <Pressable
              onPress={() => void setCurrency("USDT")}
              style={[
                styles.currencyBtn,
                !showingLocal && { backgroundColor: theme.primarySoft },
              ]}
            >
              <Text
                style={{
                  color: !showingLocal ? theme.primary : theme.muted,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                USDT
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void setCurrency("LOCAL")}
              style={[
                styles.currencyBtn,
                showingLocal && { backgroundColor: theme.primarySoft },
              ]}
            >
              <Text
                style={{
                  color: showingLocal ? theme.primary : theme.muted,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {localCode || "Local"}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => navigation.navigate("Transactions")}
            style={[styles.historyBtn, { backgroundColor: theme.iconBtn }]}
          >
            <Ionicons name="time-outline" size={18} color={theme.text} />
          </Pressable>
        </View>
      </View>

      <ScreenState loading={loading} error={error} onRetry={() => void load()}>
        <ScrollView
          contentContainerStyle={styles.content}
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
        >
          <View style={styles.equityBlock}>
            <Pressable onPress={() => setHideBalance((v) => !v)} style={styles.equityLabelRow}>
              <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "600" }}>
                Total equity
              </Text>
              <Ionicons
                name={hideBalance ? "eye-off-outline" : "eye-outline"}
                size={15}
                color={theme.muted}
              />
            </Pressable>
            <Text style={[styles.equity, { color: theme.text }]}>{mask(total)}</Text>
            <Text style={{ color: theme.muted, marginTop: 6, fontSize: 12 }}>
              Available {mask(available)} · Locked {mask(locked)}
            </Text>
            {display?.rate && showingLocal ? (
              <Text style={{ color: theme.muted, marginTop: 4, fontSize: 11 }}>
                1 USDT ≈ {display.rate.toLocaleString()} {display.code}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            <ActionIconButton
              icon="arrow-down-outline"
              label="Deposit"
              onPress={() => navigation.navigate("Deposit")}
            />
            <ActionIconButton
              icon="arrow-up-outline"
              label="Withdraw"
              onPress={() => navigation.navigate("Withdraw")}
            />
            <ActionIconButton
              icon="wallet-outline"
              label="Wallets"
              onPress={() => navigation.navigate("SavedWallets")}
            />
            <ActionIconButton
              icon="list-outline"
              label="History"
              onPress={() => navigation.navigate("Transactions")}
            />
          </View>

          <SectionCard title="Funding" padded={false}>
            <ListRow
              title="USDT"
              subtitle="Tether · Funding"
              value={mask(available)}
              onPress={() => navigation.navigate("Deposit")}
              showChevron
            />
            <ListRow title="Locked" subtitle="Pending / reserved" value={mask(locked)} />
            {summary?.withdrawalFeeUsdt != null ? (
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: theme.muted, fontSize: 11 }}>
                  Withdrawal fee · {formatMoney(summary.withdrawalFeeUsdt, display)}
                  {summary.vipActive ? " · VIP $0 fee" : ""}
                </Text>
              </View>
            ) : null}
          </SectionCard>

          <Pressable onPress={() => navigation.navigate("Journal")} style={{ marginTop: 2 }}>
            <Text style={{ color: theme.primary, fontWeight: "600", fontSize: 13 }}>
              Income journal →
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  currencySwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
  },
  currencyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  historyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  equityBlock: { marginTop: 6, marginBottom: 18 },
  equityLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  equity: { fontSize: 32, fontWeight: "800", marginTop: 6, letterSpacing: -0.8 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    paddingHorizontal: 2,
  },
});
