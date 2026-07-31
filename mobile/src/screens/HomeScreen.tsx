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
import { BrandMark, MoneyRow, PrimaryButton, SectionCard, VerticalActionCard } from "../components/ui";
import { InvestorPolicyBanners } from "../components/InvestorPolicyBanners";
import { useSidebar } from "../components/AppSidebar";
import { formatMoney, formatUsdt } from "../lib/format";
import type {
  DisplayCurrencyInfo,
  InvestorStatus,
  WalletSummary,
} from "../lib/types";
import type { HomeStackParamList } from "../navigation/types";

export function HomeScreen() {
  const { user, dashboard, refreshDashboard, api } = useAuth();
  const { theme } = useTheme();
  const { open } = useSidebar();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [display, setDisplay] = useState<DisplayCurrencyInfo | null>(null);
  const [investor, setInvestor] = useState<InvestorStatus | null>(null);

  const load = useCallback(async () => {
    await refreshDashboard();
    try {
      const [summary, inv] = await Promise.all([
        api.wallet.summary(),
        api.investor.status().catch(() => null),
      ]);
      setWallet(summary);
      setDisplay(summary.displayCurrency ?? null);
      setInvestor(inv);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigation.getParent() as any)?.navigate("Wallet", { screen });
  }

  function goTab(tab: "Journal" | "Invest" | "Account", screen?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parent = navigation.getParent() as any;
    if (screen) parent?.navigate(tab, { screen });
    else parent?.navigate(tab);
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
        <View style={styles.topRow}>
          <BrandMark size="sm" />
          <Pressable onPress={open} hitSlop={10}>
            <Text style={{ color: theme.primary, fontWeight: "800" }}>Menu</Text>
          </Pressable>
        </View>
        <Text style={[styles.hello, { color: theme.text }]}>
          {dashboard?.user.displayName ?? user?.displayName ?? "Trader"}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]}>
          {status}
          {dashboard?.user.tradingDaysRemaining != null
            ? ` · ${dashboard.user.tradingDaysRemaining}d access left`
            : ""}
        </Text>

        <InvestorPolicyBanners
          investmentBalance={investor?.investmentBalance ?? 0}
          vipActive={Boolean(investor?.vip?.active)}
          vipDailyYieldPercent={
            investor?.vip?.benefits?.dailyYieldPercent ??
            investor?.vipDailyYieldPercent ??
            10
          }
        />

        {needsActivation ? (
          <SectionCard title="Activate account">
            <Text
              style={{
                color: theme.muted,
                marginBottom: 14,
                lineHeight: 20,
                fontSize: 13,
              }}
            >
              Complete registration payment or apply a promo to unlock trading access.
            </Text>
            <PrimaryButton
              label="Activate now"
              onPress={() => navigation.navigate("RegistrationPayment")}
            />
          </SectionCard>
        ) : null}

        <SectionCard>
          <Text style={{ color: theme.muted, fontSize: 13, fontWeight: "700" }}>
            Funding balance
          </Text>
          <Text style={[styles.balance, { color: theme.text }]}>
            {formatMoney(available, display)}
          </Text>
          {account ? (
            <Text style={{ color: theme.muted, marginTop: 10, fontSize: 13 }}>
              Virtual {account.tier} · {formatUsdt(account.balance)}
            </Text>
          ) : (
            <Text style={{ color: theme.muted, marginTop: 10, fontSize: 13 }}>
              Virtual account appears after activation
            </Text>
          )}
        </SectionCard>

        <Text style={[styles.sectionLabel, { color: theme.text }]}>Quick actions</Text>
        <VerticalActionCard
          icon="arrow-down"
          title="Deposit"
          subtitle="Add USDT to funding"
          onPress={() => goWallet("Deposit")}
        />
        <VerticalActionCard
          icon="arrow-up"
          title="Withdraw"
          subtitle="Confirm with your app PIN"
          onPress={() => goWallet("Withdraw")}
          accent
        />
        <VerticalActionCard
          icon="shield-checkmark"
          title="Unitrust"
          subtitle="5% daily · monthly withdraw"
          onPress={() => goTab("Invest", "Unitrust")}
        />
        <VerticalActionCard
          icon="book-outline"
          title="Journal"
          subtitle="Income target & credits"
          onPress={() => goTab("Journal")}
        />
        <VerticalActionCard
          icon="chatbubbles-outline"
          title="Support"
          subtitle="Chat with agents"
          onPress={() => goTab("Account", "MessagesMain")}
        />

        {account ? (
          <SectionCard title="Virtual account">
            <MoneyRow label="Balance" value={formatUsdt(account.balance)} emphasize />
            <MoneyRow label="Weekly profit" value={formatUsdt(account.weeklyProfit)} />
            <MoneyRow
              label="Win rate"
              value={`${Number(account.winRate ?? 0).toFixed(0)}%`}
            />
          </SectionCard>
        ) : null}

        <VerticalActionCard
          icon="cash-outline"
          title="Trader payouts"
          subtitle="Request and track payouts"
          onPress={() => navigation.navigate("Payouts")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { fontSize: 28, fontWeight: "900", marginTop: 18, letterSpacing: -0.6 },
  meta: { marginTop: 6, marginBottom: 24, fontSize: 13 },
  balance: { fontSize: 34, fontWeight: "900", marginTop: 10, letterSpacing: -1 },
  sectionLabel: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
    marginTop: 8,
    letterSpacing: -0.3,
  },
});
