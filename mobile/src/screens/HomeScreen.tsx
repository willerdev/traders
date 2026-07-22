import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import {
  ActionIconButton,
  MoneyRow,
  PrimaryButton,
  SectionCard,
} from "../components/ui";
import { formatMoney, formatUsdt } from "../lib/format";
import type { DisplayCurrencyInfo, WalletSummary } from "../lib/types";
import type { HomeStackParamList } from "../navigation/types";

export function HomeScreen() {
  const { user, dashboard, refreshDashboard, api } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [display, setDisplay] = useState<DisplayCurrencyInfo | null>(null);

  const load = useCallback(async () => {
    await refreshDashboard();
    try {
      const summary = await api.wallet.summary();
      setWallet(summary);
      setDisplay(summary.displayCurrency ?? null);
    } catch {
      /* optional */
    }
  }, [api, refreshDashboard]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const status = dashboard?.user.status ?? user?.status ?? "—";
  const needsActivation =
    status !== "ACTIVE" || dashboard?.user.tradingAccessActive === false;
  const account = dashboard?.account;
  const available = wallet?.availableBalance ?? 0;

  function goWallet(screen: "Deposit" | "Withdraw") {
    // Nested tab → stack navigation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation.getParent() as any)?.navigate("Wallet", { screen });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.primary}
          />
        }
      >
        <Text style={[styles.brand, { color: theme.primary }]}>TraderRank Pro</Text>
        <Text style={[styles.hello, { color: theme.text }]}>
          {dashboard?.user.displayName ?? user?.displayName ?? "Trader"}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]}>
          {status}
          {dashboard?.user.tradingDaysRemaining != null
            ? ` · ${dashboard.user.tradingDaysRemaining}d access left`
            : ""}
        </Text>

        {needsActivation ? (
          <SectionCard title="Activate account">
            <Text style={{ color: theme.muted, marginBottom: 10, lineHeight: 18, fontSize: 13 }}>
              Complete registration payment or apply a promo to unlock trading access.
            </Text>
            <PrimaryButton
              label="Activate now"
              size="sm"
              onPress={() => navigation.navigate("RegistrationPayment")}
            />
          </SectionCard>
        ) : null}

        <SectionCard>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "600" }}>Funding balance</Text>
          <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800", marginTop: 6 }}>
            {formatMoney(available, display)}
          </Text>
          {account ? (
            <Text style={{ color: theme.muted, marginTop: 8, fontSize: 12 }}>
              Virtual {account.tier} · {formatUsdt(account.balance)}
            </Text>
          ) : (
            <Text style={{ color: theme.muted, marginTop: 8, fontSize: 12 }}>
              Virtual account appears after activation
            </Text>
          )}

          <View style={styles.quickRow}>
            <ActionIconButton
              icon="arrow-down-outline"
              label="Deposit"
              onPress={() => goWallet("Deposit")}
            />
            <ActionIconButton
              icon="arrow-up-outline"
              label="Withdraw"
              onPress={() => goWallet("Withdraw")}
            />
            <ActionIconButton
              icon="trending-up-outline"
              label="Invest"
              onPress={() => navigation.getParent()?.navigate("Invest" as never)}
            />
            <ActionIconButton
              icon="chatbubbles-outline"
              label="Support"
              onPress={() => navigation.getParent()?.navigate("Messages" as never)}
            />
          </View>
        </SectionCard>

        {account ? (
          <SectionCard title="Virtual account">
            <MoneyRow label="Balance" value={formatUsdt(account.balance)} emphasize />
            <MoneyRow label="Weekly profit" value={formatUsdt(account.weeklyProfit)} />
            <MoneyRow label="Win rate" value={`${account.winRate.toFixed(0)}%`} />
          </SectionCard>
        ) : null}

        <SectionCard title="More" padded={false}>
          <Pressable
            onPress={() => navigation.navigate("Journal")}
            style={[styles.linkRow, { borderBottomColor: theme.divider }]}
          >
            <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>Income journal</Text>
            <Text style={{ color: theme.primary, fontSize: 13 }}>Open</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("Payouts")}
            style={styles.linkRow}
          >
            <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>Trader payouts</Text>
            <Text style={{ color: theme.primary, fontSize: 13 }}>Open</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  brand: { fontSize: 12, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  hello: { fontSize: 26, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 },
  meta: { marginTop: 4, marginBottom: 16, fontSize: 12 },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
