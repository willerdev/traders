import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { Field, MoneyRow, PrimaryButton, ScreenState, SectionCard } from "../components/ui";
import { formatUsdt, fmtDate } from "../lib/format";
import type { InvestorStatus } from "../lib/types";

export function InvestScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [status, setStatus] = useState<InvestorStatus | null>(null);
  const [vipFee, setVipFee] = useState<number | null>(null);
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [st, vip] = await Promise.all([api.investor.status(), api.investor.vipStatus()]);
      setStatus(st);
      setVipFee(vip.feeUsdt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load investor status");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function allocate() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setBusy(true);
    try {
      const res = await api.investor.allocate(value);
      Alert.alert("Allocated", `${formatUsdt(res.amount)} moved to investment`);
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Allocate failed");
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setBusy(true);
    try {
      const res = await api.investor.redeem(value);
      Alert.alert("Redeemed", `${formatUsdt(res.amount)} returned to wallet`);
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Redeem failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    setBusy(true);
    try {
      if (status?.settings?.paused) await api.investor.resume();
      else await api.investor.pause();
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function upgradeVip() {
    setBusy(true);
    try {
      const res = await api.investor.vipUpgrade();
      Alert.alert("VIP", res.message || "VIP upgraded");
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "VIP upgrade failed");
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    setBusy(true);
    try {
      const res = await api.investor.enrollCheckout("TRC20", "wallet", Number(amount) || undefined);
      Alert.alert("Enroll", res.message || (res.success ? "Enrolled from wallet" : "Checkout created"));
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <Text style={[styles.title, { color: theme.text }]}>Invest</Text>
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
          <SectionCard title="Status">
            <MoneyRow label="Active" value={status?.active ? "Yes" : "No"} />
            <MoneyRow label="Wallet" value={formatUsdt(status?.walletBalance)} />
            <MoneyRow label="Investment" value={formatUsdt(status?.investmentBalance)} emphasize />
            <MoneyRow label="Daily yield" value={`${status?.dailyYieldPercent ?? 0}%`} />
            {status?.vip?.active ? (
              <Text style={{ color: theme.primary, marginTop: 8, fontWeight: "700" }}>
                VIP · expires {status.vip.expiresAt ? fmtDate(status.vip.expiresAt) : "—"}
              </Text>
            ) : (
              <Text style={{ color: theme.muted, marginTop: 8 }}>
                VIP (~{formatUsdt(vipFee ?? 20)}/mo) · $0 withdrawal fee
              </Text>
            )}
            {status?.settings ? (
              <Text style={{ color: theme.muted, marginTop: 8 }}>
                Risk {status.settings.riskPercent}% · {status.settings.paused ? "Paused" : "Running"}
              </Text>
            ) : null}
          </SectionCard>

          {!status?.active ? (
            <PrimaryButton label={busy ? "…" : "Enroll from wallet"} onPress={() => void enroll()} disabled={busy} />
          ) : (
            <>
              <SectionCard title="Transfer">
                <Field label="Amount USDT" value={amount} onChangeText={setAmount} keyboardType="numeric" />
                <PrimaryButton label="Allocate → investment" onPress={() => void allocate()} disabled={busy} />
                <View style={{ height: 10 }} />
                <PrimaryButton
                  label="Redeem → wallet"
                  onPress={() => void redeem()}
                  disabled={busy}
                  variant="secondary"
                />
              </SectionCard>
              <PrimaryButton
                label={status.settings?.paused ? "Resume" : "Pause"}
                onPress={() => void togglePause()}
                disabled={busy}
                variant="ghost"
              />
            </>
          )}

          {!status?.vip?.active ? (
            <>
              <View style={{ height: 12 }} />
              <PrimaryButton
                label={busy ? "…" : `Upgrade VIP${vipFee != null ? ` · ${formatUsdt(vipFee)}` : ""}`}
                onPress={() => void upgradeVip()}
                disabled={busy}
                variant="secondary"
              />
            </>
          ) : null}
        </ScrollView>
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: { fontSize: 28, fontWeight: "800", paddingHorizontal: 20, paddingTop: 8, letterSpacing: -0.4 },
  content: { padding: 20, paddingBottom: 40 },
});
