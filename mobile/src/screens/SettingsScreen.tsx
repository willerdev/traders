import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { Field, ListRow, PrimaryButton, ScreenState, SectionCard } from "../components/ui";
import { WEB_APP_URL } from "../config/env";
import type { UserSettings } from "../lib/types";
import type { MoreStackParamList } from "../navigation/types";

const JUMP = [
  { id: "profile", label: "Profile" },
  { id: "money", label: "Money" },
  { id: "security", label: "Security" },
  { id: "app", label: "App" },
] as const;

export function SettingsScreen() {
  const { api, user, logout, refreshDashboard } = useAuth();
  const { theme, mode, setMode } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.users.settings();
      setSettings(data);
      setDisplayName(data.user.displayName);
      setCountry(data.profile?.country ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveProfile() {
    setBusy(true);
    try {
      await api.users.updateProfile({ displayName: displayName.trim() });
      await api.users.updateAddress({ country: country.trim() || undefined });
      await refreshDashboard();
      Alert.alert("Saved", "Profile updated");
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function jumpTo(id: string) {
    const y = sectionY.current[id];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>
        Profile, payouts, security, and appearance
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.jumpRow}
        style={styles.jumpScroll}
      >
        {JUMP.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => jumpTo(item.id)}
            style={[
              styles.jumpChip,
              { borderColor: theme.divider, backgroundColor: theme.surface },
            ]}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScreenState loading={loading} error={error} onRetry={() => void load()}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={theme.primary}
            />
          }
        >
          <View
            onLayout={(e) => {
              sectionY.current.profile = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>Profile</Text>
            <SectionCard title="Profile info">
              <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 12 }}>
                {settings?.user.email ?? user?.email}
              </Text>
              <Field
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
              <Field
                label="Country"
                value={country}
                onChangeText={setCountry}
                autoCapitalize="words"
                placeholder="e.g. Uganda"
              />
              <Text style={{ color: theme.muted, marginBottom: 10, fontSize: 11 }}>
                Used for local daily credit time and currency display.
              </Text>
              <PrimaryButton
                label={busy ? "Saving…" : "Save profile"}
                onPress={() => void saveProfile()}
                disabled={busy}
                size="sm"
              />
            </SectionCard>
          </View>

          <View
            onLayout={(e) => {
              sectionY.current.money = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>Money & KYC</Text>
            <SectionCard title="Payouts & verification" padded={false}>
              <ListRow
                title="Payout details"
                subtitle="TRC20 / mobile money on web"
                showChevron
                onPress={() => void Linking.openURL(`${WEB_APP_URL}/settings`)}
              />
              <ListRow
                title="KYC verification"
                subtitle="Required for payouts only"
                showChevron
                onPress={() => navigation.navigate("Kyc")}
              />
              <ListRow
                title="Withdrawal wallets"
                subtitle="Manage saved destinations"
                showChevron
                onPress={() => navigation.navigate("SavedWallets")}
              />
              <ListRow
                title="Terms & Conditions"
                subtitle="Withdrawals, vault & risk"
                showChevron
                onPress={() => navigation.navigate("Terms")}
              />
            </SectionCard>
          </View>

          <View
            onLayout={(e) => {
              sectionY.current.security = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>Security</Text>
            <SectionCard title="Security" padded={false}>
              <ListRow
                title="Change password"
                subtitle="Opens secure reset on the web"
                showChevron
                onPress={() => void Linking.openURL(`${WEB_APP_URL}/forgot-password`)}
              />
            </SectionCard>
          </View>

          <View
            onLayout={(e) => {
              sectionY.current.app = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>App</Text>
            <SectionCard title="Appearance">
              <View style={styles.themeRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>
                    Dark mode
                  </Text>
                  <Text style={{ color: theme.muted, marginTop: 2, fontSize: 11 }}>
                    {mode === "dark"
                      ? "Navy Trade Guard theme"
                      : "Light slate theme"}
                  </Text>
                </View>
                <Switch
                  value={mode === "dark"}
                  onValueChange={(dark) => setMode(dark ? "dark" : "light")}
                  trackColor={{ false: theme.surfaceAlt, true: theme.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.modeButtons}>
                <Pressable
                  onPress={() => setMode("dark")}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor: mode === "dark" ? theme.primarySoft : theme.surfaceAlt,
                      borderColor: mode === "dark" ? theme.primary : theme.divider,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13 }}>Dark</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode("light")}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor: mode === "light" ? theme.primarySoft : theme.surfaceAlt,
                      borderColor: mode === "light" ? theme.primary : theme.divider,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13 }}>Light</Text>
                </Pressable>
              </View>
            </SectionCard>
          </View>

          <PrimaryButton label="Sign out" onPress={() => void logout()} variant="secondary" size="sm" />
        </ScrollView>
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 6,
    letterSpacing: -0.3,
  },
  sub: { fontSize: 12, paddingHorizontal: 16, marginTop: 2, marginBottom: 8 },
  jumpScroll: { maxHeight: 44, marginBottom: 4 },
  jumpRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  jumpChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  content: { padding: 16, paddingBottom: 36 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modeButtons: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
});
