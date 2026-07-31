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
import { BrandMark, Field, PrimaryButton } from "../../components/ui";
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
          <BrandMark size="lg" />
          <Text style={[styles.tagline, { color: theme.muted }]}>
            Sign in to your account
          </Text>
        </View>

        <View style={styles.form}>
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
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
          ) : (
            <PrimaryButton label="Sign in" onPress={() => void handleLogin()} />
          )}
        </View>

        <View style={styles.footer}>
          <Pressable onPress={() => navigation.navigate("Register")} style={styles.linkWrap}>
            <Text style={[styles.link, { color: theme.primary }]}>
              New here? Create an account
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void Linking.openURL(`${WEB_APP_URL}/forgot-password`)}
            style={styles.linkWrap}
          >
            <Text style={[styles.linkMuted, { color: theme.muted }]}>
              Forgot password? Reset on web
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1 },
        container: {
          flex: 1,
          paddingHorizontal: 28,
          justifyContent: "center",
        },
        hero: { marginBottom: 40, gap: 10 },
        tagline: { fontSize: 15, fontWeight: "500", marginTop: 4 },
        form: { gap: 4 },
        error: { marginBottom: 12, fontSize: 13 },
        footer: { marginTop: 36, gap: 8 },
        linkWrap: { alignItems: "center", paddingVertical: 6 },
        link: { fontSize: 15, fontWeight: "700" },
        linkMuted: { fontSize: 13, fontWeight: "600" },
      }),
    [],
  );
}
