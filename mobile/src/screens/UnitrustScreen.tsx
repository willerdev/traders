import { useCallback, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { Field, PrimaryButton, ScreenState, SectionCard } from "../components/ui";
import { formatUsdt } from "../lib/format";

type UnitrustStatus = {
  active: boolean;
  unitrustBalance: number;
  availableBalance: number;
  dailyYieldPercent: number;
  minDepositUsdt: number;
  projectedDailyEarning: number;
  canWithdrawThisMonth: boolean;
  nextWithdrawAt: string | null;
  recentCredits: Array<{ amount: number; creditDate: string }>;
};

export function UnitrustScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [status, setStatus] = useState<UnitrustStatus | null>(null);
  const [amount, setAmount] = useState("100");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api.unitrust.status());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Unitrust");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function deposit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.unitrust.enroll(value);
      Alert.alert("Unitrust", res.message);
      setAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    const value = Number(redeemAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.unitrust.redeem(value);
      Alert.alert("Unitrust", res.message);
      setRedeemAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ScreenState
        loading={loading}
        error={error && !status ? error : null}
        onRetry={() => void load()}
      >
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
          <Text style={[styles.title, { color: theme.text }]}>Unitrust</Text>
          <Text style={{ color: theme.muted, marginBottom: 14, fontSize: 13, lineHeight: 18 }}>
            {status?.dailyYieldPercent ?? 5}% daily on corpus · withdraw once per
            month (Kampala calendar)
          </Text>

          <SectionCard>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Corpus</Text>
            <Text style={{ color: theme.text, fontSize: 28, fontWeight: "700" }}>
              {formatUsdt(status?.unitrustBalance ?? 0)}
            </Text>
            <Text style={{ color: theme.muted, marginTop: 8, fontSize: 12 }}>
              Projected daily · {formatUsdt(status?.projectedDailyEarning ?? 0)}
            </Text>
            <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>
              Wallet · {formatUsdt(status?.availableBalance ?? 0)}
            </Text>
          </SectionCard>

          <SectionCard title="Deposit from wallet">
            <Field
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder={String(status?.minDepositUsdt ?? 100)}
            />
            <PrimaryButton
              label={busy ? "Working…" : "Deposit"}
              loading={busy}
              onPress={() => void deposit()}
            />
          </SectionCard>

          {status?.active ? (
            <SectionCard title="Monthly withdrawal">
              <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>
                {status.canWithdrawThisMonth
                  ? "One withdrawal available this month."
                  : `Next window: ${
                      status.nextWithdrawAt
                        ? new Date(status.nextWithdrawAt).toLocaleDateString()
                        : "next month"
                    }`}
              </Text>
              <Field
                label="Amount to wallet"
                value={redeemAmount}
                onChangeText={setRedeemAmount}
                keyboardType="numeric"
                placeholder="0.00"
              />
              <PrimaryButton
                label={busy ? "Working…" : "Withdraw"}
                loading={busy}
                variant="secondary"
                disabled={!status.canWithdrawThisMonth}
                onPress={() => void withdraw()}
              />
            </SectionCard>
          ) : null}

          {status?.recentCredits?.length ? (
            <SectionCard title="Recent credits">
              {status.recentCredits.map((c) => (
                <View key={c.creditDate} style={styles.row}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {c.creditDate}
                  </Text>
                  <Text style={{ color: theme.primary, fontWeight: "600" }}>
                    +{formatUsdt(c.amount)}
                  </Text>
                </View>
              ))}
            </SectionCard>
          ) : null}

          {error ? (
            <Text style={{ color: theme.danger, marginTop: 8 }}>{error}</Text>
          ) : null}
        </ScrollView>
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
});
