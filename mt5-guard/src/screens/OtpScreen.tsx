import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import type { AuthStackParamList } from "../navigation/types";
import { PrimaryButton } from "../components/ui";

type Props = NativeStackScreenProps<AuthStackParamList, "Otp">;

export function OtpScreen({ route }: Props) {
  const { verifyOtp, resendOtp } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>Verify login</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>Code sent to {email}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.divider, color: theme.text }]}
          placeholder="000000"
          placeholderTextColor={theme.muted}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
        {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
        <PrimaryButton label={busy ? "Verifying…" : "Verify"} onPress={() => void submit()} disabled={busy} />
        <Pressable onPress={() => void resend()} disabled={cooldown > 0}>
          <Text style={[styles.resend, { color: theme.buy }]}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Text>
        </Pressable>
        {busy ? <ActivityIndicator color={theme.primary} style={{ marginTop: 16 }} /> : null}
      </View>
    </SafeAreaView>
  );
}

function useStyles() {
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1 },
        container: { flex: 1, padding: 28, justifyContent: "center" },
        title: { fontSize: 26, fontWeight: "800" },
        sub: { marginBottom: 28, marginTop: 8, fontSize: 14 },
        input: {
          borderWidth: 1,
          borderRadius: 12,
          padding: 16,
          fontSize: 28,
          letterSpacing: 10,
          textAlign: "center",
          marginBottom: 16,
        },
        error: { marginBottom: 12, fontSize: 13 },
        resend: { textAlign: "center", marginTop: 24, fontWeight: "600" },
      }),
    [],
  );
}
