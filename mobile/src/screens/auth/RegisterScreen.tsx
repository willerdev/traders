import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { Field, PrimaryButton } from "../../components/ui";
import { registerSchema } from "../../lib/schemas";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    const parsed = registerSchema.safeParse({
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      password,
      referralCode: referralCode.trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: parsed.data.displayName,
        referralCode: parsed.data.referralCode,
      });
      Alert.alert("Account created", "Sign in to continue activation.", [
        { text: "Sign in", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.lead, { color: theme.muted }]}>
          Invite-only registration. After signup you will pay the registration fee (or apply a
          promo) to reach ACTIVE status.
        </Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Min 8 characters"
          />
          <Field
            label="Referral / invite code"
            value={referralCode}
            onChangeText={setReferralCode}
            placeholder="Required by backend"
            autoCapitalize="characters"
          />
          {error ? <Text style={{ color: theme.error, marginBottom: 12 }}>{error}</Text> : null}
          <PrimaryButton
            label={busy ? "Creating…" : "Create account"}
            onPress={() => void handleRegister()}
            disabled={busy}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function useStyles() {
  return useMemo(
    () =>
      StyleSheet.create({
        flex: { flex: 1 },
        container: { padding: 20, paddingBottom: 40 },
        lead: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
        card: { borderRadius: 16, borderWidth: 1, padding: 16 },
      }),
    [],
  );
}
