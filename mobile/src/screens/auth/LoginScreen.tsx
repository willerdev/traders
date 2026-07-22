import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { WEB_APP_URL } from "../../config/env";
import { Field, PrimaryButton } from "../../components/ui";
import { loginSchema } from "../../lib/schemas";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login, setSession } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    const parsed = loginSchema.safeParse({
      email: email.trim().toLowerCase(),
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await login(parsed.data.email, parsed.data.password);
      if ("requiresOtp" in res && res.requiresOtp) {
        navigation.navigate("Otp", {
          loginSessionId: res.loginSessionId,
          email: res.email,
        });
        return;
      }
      if ("accessToken" in res) {
        await setSession(res.accessToken, res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.hero}>
          <Text style={[styles.brand, { color: theme.primary }]}>TraderRank Pro</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            Deposit · Invest · Compete · Support
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Sign in</Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
          {busy ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />
          ) : (
            <PrimaryButton label="Sign in" onPress={() => void handleLogin()} />
          )}
        </View>

        <Pressable onPress={() => navigation.navigate("Register")} style={styles.linkWrap}>
          <Text style={[styles.link, { color: theme.primary }]}>New here? Create an account</Text>
        </Pressable>
        <Pressable
          onPress={() => void Linking.openURL(`${WEB_APP_URL}/forgot-password`)}
          style={styles.linkWrap}
        >
          <Text style={[styles.linkMuted, { color: theme.muted }]}>
            Forgot password? Reset on web
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1 },
        container: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
        hero: { alignItems: "center", marginBottom: 28 },
        brand: { fontSize: 32, fontWeight: "800", letterSpacing: -0.6 },
        sub: { marginTop: 8, fontSize: 14 },
        card: { borderRadius: 20, borderWidth: 1, padding: 22 },
        cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 18 },
        error: { marginBottom: 12, fontSize: 13 },
        linkWrap: { marginTop: 18, alignItems: "center" },
        link: { fontSize: 14, fontWeight: "700" },
        linkMuted: { fontSize: 13, fontWeight: "600" },
      }),
    [],
  );
}
