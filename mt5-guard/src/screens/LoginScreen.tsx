import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { WEB_APP_URL } from "../config/env";
import type { AuthStackParamList } from "../navigation/types";

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
    if (!email.trim() || !password) {
      setError("Enter email and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await login(email.trim().toLowerCase(), password);
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

  const btnBg = theme.mode === "blue" ? theme.primary : theme.mode === "light" ? "#09090b" : theme.text;
  const btnText = theme.mode === "dark" ? theme.bg : "#ffffff";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.hero}>
          <Text style={[styles.logo, { color: theme.text }]}>MT5 Guard</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>Wallet · Charts · Trade · History</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Sign in</Text>

          <Text style={[styles.fieldLabel, { color: theme.muted }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.divider, color: theme.text }]}
            placeholder="you@example.com"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[styles.fieldLabel, { color: theme.muted }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.divider, color: theme.text }]}
            placeholder="••••••••"
            placeholderTextColor={theme.muted}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

          <Pressable
            onPress={() => void handleLogin()}
            disabled={busy}
            style={({ pressed }) => [
              styles.signInBtn,
              { backgroundColor: btnBg, opacity: busy ? 0.6 : pressed ? 0.9 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={btnText} />
            ) : (
              <Text style={[styles.signInText, { color: btnText }]}>Sign in</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => void Linking.openURL(`${WEB_APP_URL}/forgot-password`)} style={styles.linkWrap}>
          <Text style={[styles.link, { color: theme.buy }]}>Forgot password? Reset on web</Text>
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
        logo: { fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
        sub: { marginTop: 8, fontSize: 14 },
        card: {
          borderRadius: 20,
          borderWidth: 1,
          padding: 22,
        },
        cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 18 },
        fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, textTransform: "uppercase" },
        input: {
          borderWidth: 1,
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          fontSize: 16,
        },
        error: { marginBottom: 12, fontSize: 13 },
        signInBtn: {
          borderRadius: 12,
          paddingVertical: 16,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 52,
          marginTop: 4,
        },
        signInText: { fontWeight: "700", fontSize: 16 },
        linkWrap: { marginTop: 24, alignItems: "center" },
        link: { fontSize: 13, fontWeight: "600" },
      }),
    [],
  );
}
