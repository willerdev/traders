import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { colors } from "../theme/colors";
import type { AuthStackParamList } from "../navigation/types";
import { PrimaryButton } from "../components/ui";

type Props = NativeStackScreenProps<AuthStackParamList, "Otp">;

export function OtpScreen({ route }: Props) {
  const { verifyOtp, resendOtp } = useAuth();
  const { loginSessionId, email } = route.params;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit() {
    if (code.length < 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(loginSessionId, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    try {
      const expiresIn = await resendOtp(loginSessionId);
      setCooldown(Math.min(expiresIn, 60));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify login</Text>
      <Text style={styles.sub}>Code sent to {email}</Text>
      <TextInput
        style={styles.input}
        placeholder="000000"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={busy ? "Verifying…" : "Verify"}
        onPress={() => void submit()}
        disabled={busy}
      />
      <Pressable onPress={() => void resend()} disabled={cooldown > 0}>
        <Text style={styles.resend}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Text>
      </Pressable>
      {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  sub: { color: colors.muted, marginBottom: 24, marginTop: 8 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    marginBottom: 16,
  },
  error: { color: colors.error, marginBottom: 12 },
  resend: { color: colors.buy, textAlign: "center", marginTop: 20 },
});
