import { useCallback, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { Field, ListRow, PrimaryButton, ScreenState, SectionCard } from "../components/ui";
import { WEB_APP_URL } from "../config/env";
import type { UserSettings } from "../lib/types";

export function SettingsScreen() {
  const { api, user, logout, refreshDashboard } = useAuth();
  const { theme, mode, setMode } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [displayName, setDisplayName] = useState("");
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
      await refreshDashboard();
      Alert.alert("Saved", "Profile updated");
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
      <ScreenState loading={loading} error={error} onRetry={() => void load()}>
        <ScrollView
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
            <PrimaryButton
              label={busy ? "Saving…" : "Save profile"}
              onPress={() => void saveProfile()}
              disabled={busy}
              size="sm"
            />
          </SectionCard>

          <SectionCard title="Security" padded={false}>
            <ListRow
              title="Change password"
              subtitle="Opens secure reset on the web"
              showChevron
              onPress={() => void Linking.openURL(`${WEB_APP_URL}/forgot-password`)}
            />
          </SectionCard>

          <SectionCard title="Appearance">
            <View style={styles.themeRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}>Dark mode</Text>
                <Text style={{ color: theme.muted, marginTop: 2, fontSize: 11 }}>
                  {mode === "dark" ? "Black & white" : "Blue & white"}
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

          <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16, marginBottom: 12 }}>
            KYC, payout wallets, and advanced account options are managed on the web.
          </Text>

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
  content: { padding: 16, paddingBottom: 36 },
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
