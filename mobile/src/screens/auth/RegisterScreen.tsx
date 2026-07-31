import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { BrandMark, Field, PrimaryButton } from "../../components/ui";
import { registerSchema } from "../../lib/schemas";
import { WEB_APP_URL } from "../../config/env";
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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (!acceptTerms) {
      setError("You must accept the Terms & Conditions");
      return;
    }
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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <BrandMark size="lg" />
            <Text style={[styles.lead, { color: theme.muted }]}>
              Create your account. After signup, pay the registration fee or apply a promo to
              reach ACTIVE status.
            </Text>
          </View>

          <Field
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
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

          <Pressable
            onPress={() => setAcceptTerms((v) => !v)}
            style={styles.termsRow}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: acceptTerms ? theme.primary : theme.divider,
                backgroundColor: acceptTerms ? theme.primary : "transparent",
                marginTop: 2,
              }}
            />
            <Text style={{ color: theme.muted, flex: 1, fontSize: 13, lineHeight: 20 }}>
              I accept the{" "}
              <Text
                style={{ color: theme.primary, fontWeight: "700" }}
                onPress={() => void Linking.openURL(`${WEB_APP_URL}/terms`)}
              >
                Terms & Conditions
              </Text>
            </Text>
          </Pressable>

          {error ? <Text style={{ color: theme.error, marginBottom: 16 }}>{error}</Text> : null}

          <PrimaryButton
            label={busy ? "Creating…" : "Create account"}
            onPress={() => void handleRegister()}
            disabled={busy || !acceptTerms}
            loading={busy}
          />

          <Pressable onPress={() => navigation.navigate("Login")} style={styles.linkWrap}>
            <Text style={[styles.link, { color: theme.primary }]}>
              Already have an account? Sign in
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1 },
        flex: { flex: 1 },
        container: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 48 },
        hero: { marginBottom: 32, gap: 12 },
        lead: { fontSize: 14, lineHeight: 22 },
        termsRow: {
          flexDirection: "row",
          gap: 12,
          marginBottom: 24,
          marginTop: 8,
          alignItems: "flex-start",
        },
        linkWrap: { marginTop: 28, alignItems: "center", paddingVertical: 8 },
        link: { fontSize: 15, fontWeight: "700" },
      }),
    [],
  );
}
