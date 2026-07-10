import { useState } from "react";
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
import * as Linking from "expo-linking";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { WEB_APP_URL } from "../config/env";
import { colors } from "../theme/colors";
import type { AuthStackParamList } from "../navigation/types";
import { PrimaryButton } from "../components/ui";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login, setSession } = useAuth();
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.logo}>MT5 Guard</Text>
      <Text style={styles.sub}>Wallet · MT5 · Settings</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        label={busy ? "Signing in…" : "Sign in"}
        onPress={() => void handleLogin()}
        disabled={busy}
      />

      <Pressable
        onPress={() => void Linking.openURL(`${WEB_APP_URL}/forgot-password`)}
        style={styles.linkWrap}
      >
        <Text style={styles.link}>Forgot password? Reset on web</Text>
      </Pressable>

      {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: "center",
  },
  logo: { color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "center" },
  sub: { color: colors.muted, textAlign: "center", marginBottom: 32, marginTop: 8 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    marginBottom: 12,
  },
  error: { color: colors.error, marginBottom: 12, fontSize: 13 },
  linkWrap: { marginTop: 20, alignItems: "center" },
  link: { color: colors.buy, fontSize: 13 },
});
