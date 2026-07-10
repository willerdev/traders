import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../stores/auth";
import { colors } from "../theme/colors";
import type { SavedWithdrawalWallet, WithdrawalWalletNetwork } from "../lib/types";
import { FieldLabel, PrimaryButton, SecondaryButton } from "../components/ui";

type Props = {
  wallets: SavedWithdrawalWallet[];
  onChanged: () => void;
};

export function WithdrawalWalletsSection({ wallets, onChanged }: Props) {
  const { api } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<WithdrawalWalletNetwork>("TRC20");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setLabel("");
    setAddress("");
    setNetwork("TRC20");
    setSessionId(null);
    setOtp("");
    setError(null);
  }, []);

  useEffect(() => {
    if (!addOpen) resetForm();
  }, [addOpen, resetForm]);

  async function requestVerification() {
    if (!label.trim() || !address.trim()) {
      setError("Label and address are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.wallet.requestWalletVerification({
        label: label.trim(),
        address: address.trim(),
        network,
      });
      setSessionId(res.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    if (!sessionId || otp.length < 4) {
      setError("Enter the email verification code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.wallet.confirmWallet({ sessionId, code: otp.trim() });
      setAddOpen(false);
      onChanged();
      Alert.alert("Verified", "Withdrawal wallet saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeWallet(id: string) {
    Alert.alert("Remove wallet", "Delete this saved withdrawal address?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void api.wallet.deleteWallet(id).then(onChanged);
        },
      },
    ]);
  }

  return (
    <View>
      {wallets.length === 0 ? (
        <Text style={styles.muted}>No verified withdrawal wallets yet.</Text>
      ) : (
        wallets.map((w) => (
          <View key={w.id} style={styles.walletRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.walletLabel}>{w.label}</Text>
              <Text style={styles.muted}>
                {w.network} · {w.address.slice(0, 16)}…
              </Text>
            </View>
            <Pressable onPress={() => void removeWallet(w.id)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        ))
      )}
      <SecondaryButton label="Add withdrawal wallet" onPress={() => setAddOpen(true)} />

      <Modal visible={addOpen} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={styles.sheet}>
            <Text style={styles.title}>Add withdrawal wallet</Text>
            {!sessionId ? (
              <>
                <FieldLabel>Label</FieldLabel>
                <TextInput style={styles.input} value={label} onChangeText={setLabel} />
                <FieldLabel>Network</FieldLabel>
                <View style={styles.networkRow}>
                  {(["TRC20", "ERC20", "BEP20"] as const).map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setNetwork(n)}
                      style={[styles.chip, network === n && styles.chipActive]}
                    >
                      <Text style={styles.chipText}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <FieldLabel>Address</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  autoCapitalize="none"
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton
                  label={busy ? "…" : "Send verification email"}
                  onPress={() => void requestVerification()}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <Text style={styles.muted}>
                  Enter the code sent to your email to verify this wallet.
                </Text>
                <FieldLabel>Verification code</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={8}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton
                  label={busy ? "…" : "Confirm wallet"}
                  onPress={() => void confirmOtp()}
                  disabled={busy}
                />
              </>
            )}
            <SecondaryButton label="Cancel" onPress={() => setAddOpen(false)} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  walletLabel: { color: colors.text, fontWeight: "600" },
  remove: { color: colors.sell, fontWeight: "600", fontSize: 12 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 8,
  },
  networkRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.divider },
  chipActive: { borderColor: colors.buy, backgroundColor: "rgba(74,158,255,0.1)" },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  error: { color: colors.error, marginBottom: 8 },
});
