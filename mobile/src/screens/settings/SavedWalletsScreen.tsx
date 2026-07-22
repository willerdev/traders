import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { Field, PrimaryButton, ScreenState, SectionCard } from "../../components/ui";
import { truncateMiddle } from "../../lib/format";
import type { SavedWithdrawalWallet, WithdrawalWalletNetwork } from "../../lib/types";

export function SavedWalletsScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [label, setLabel] = useState("Main TRC20");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<WithdrawalWalletNetwork>("TRC20");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWallets(await api.wallet.withdrawalWallets());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function requestOtp() {
    if (!label.trim() || !address.trim()) {
      Alert.alert("Missing", "Label and address required");
      return;
    }
    setBusy(true);
    try {
      const res = await api.wallet.requestWithdrawalWalletVerification({
        label: label.trim(),
        address: address.trim(),
        network,
      });
      setSessionId(res.sessionId);
      Alert.alert("OTP sent", res.message);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!sessionId || code.length < 4) return;
    setBusy(true);
    try {
      await api.wallet.confirmWithdrawalWallet(sessionId, code);
      setSessionId(null);
      setCode("");
      setAddress("");
      await load();
      Alert.alert("Saved", "Withdrawal wallet verified");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.wallet.removeWithdrawalWallet(id);
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenState loading={loading} error={error} onRetry={() => void load()}>
        <ScrollView contentContainerStyle={styles.content}>
          <SectionCard title="Saved">
            {wallets.length === 0 ? (
              <Text style={{ color: theme.muted }}>No wallets yet</Text>
            ) : (
              wallets.map((w) => (
                <View key={w.id} style={{ marginBottom: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    {w.label} · {w.network}
                  </Text>
                  <Text style={{ color: theme.muted, marginVertical: 4 }}>
                    {truncateMiddle(w.address, 10, 8)}
                  </Text>
                  <PrimaryButton
                    label="Remove"
                    variant="danger"
                    onPress={() => void remove(w.id)}
                    disabled={busy}
                    size="sm"
                  />
                </View>
              ))
            )}
          </SectionCard>

          <SectionCard title="Add wallet (OTP)">
            <Field label="Label" value={label} onChangeText={setLabel} />
            <Field label="Address / MoMo number" value={address} onChangeText={setAddress} />
            <View style={{ gap: 8, marginBottom: 12 }}>
              {(["TRC20", "ERC20", "BEP20", "MOMO_MTN", "MOMO_AIRTEL"] as WithdrawalWalletNetwork[]).map(
                (n) => (
                  <PrimaryButton
                    key={n}
                    label={n}
                    variant={network === n ? "primary" : "ghost"}
                    onPress={() => setNetwork(n)}
                    size="sm"
                  />
                ),
              )}
            </View>
            {!sessionId ? (
              <PrimaryButton
                label={busy ? "…" : "Send verification OTP"}
                onPress={() => void requestOtp()}
                disabled={busy}
                size="sm"
              />
            ) : (
              <>
                <Field label="OTP code" value={code} onChangeText={setCode} keyboardType="number-pad" />
                <PrimaryButton
                  label={busy ? "…" : "Confirm wallet"}
                  onPress={() => void confirm()}
                  disabled={busy}
                  size="sm"
                />
              </>
            )}
          </SectionCard>
        </ScrollView>
      </ScreenState>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
});
