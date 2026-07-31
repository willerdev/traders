import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { useSidebar } from "../components/AppSidebar";
import { ScreenState } from "../components/ui";
import { formatMoney, formatUsdt } from "../lib/format";
import type { DisplayCurrencyInfo, WalletSummary } from "../lib/types";
import type { WalletStackParamList } from "../navigation/types";
import { navigateMain } from "../navigation/navigationRef";

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.quickItem}>
      <View style={[styles.quickBtn, { backgroundColor: theme.surfaceAlt }]}>
        <Ionicons name={icon} size={22} color={theme.text} />
      </View>
      <Text style={[styles.quickLabel, { color: theme.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function WalletScreen() {
  const { api, user } = useAuth();
  const { theme } = useTheme();
  const { open } = useSidebar();
  const navigation = useNavigation<NativeStackNavigationProp<WalletStackParamList>>();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [display, setDisplay] = useState<DisplayCurrencyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [assetTab, setAssetTab] = useState<"crypto" | "locked" | "earn">("crypto");

  const load = useCallback(async () => {
    setError(null);
    try {
      const wallet = await api.wallet.summary();
      setSummary(wallet);
      setDisplay(wallet.displayCurrency ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const available = summary?.availableBalance ?? 0;
  const locked = summary?.lockedBalance ?? 0;
  const total = available + locked;
  const earned = summary?.totalEarned ?? 0;
  const mask = (v: number) => (hideBalance ? "••••••" : formatMoney(v, display));
  const uid = user?.id ? `${user.id.slice(0, 4)}…${user.id.slice(-4)}` : "tradeguard";

  async function copyUid() {
    if (!user?.id) return;
    await Clipboard.setStringAsync(user.id);
    Alert.alert("Copied", "Account id copied");
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={open} style={[styles.iconBtn, { backgroundColor: theme.surfaceAlt }]}>
          <Ionicons name="menu-outline" size={20} color={theme.text} />
        </Pressable>
        <Pressable onPress={() => void copyUid()} style={styles.addrPill}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{uid}</Text>
          <View style={[styles.copyBadge, { backgroundColor: theme.primary }]}>
            <Text style={{ color: theme.onPrimary, fontSize: 10, fontWeight: "800" }}>Copy</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Transactions")}
          style={[styles.iconBtn, { backgroundColor: theme.surfaceAlt }]}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.text} />
        </Pressable>
      </View>

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
          <View style={styles.miniRow}>
            <View style={[styles.miniCard, { backgroundColor: theme.surface }]}>
              <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "600" }}>Available</Text>
              <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginTop: 6 }}>
                {mask(available)}
              </Text>
            </View>
            <View style={[styles.miniCard, { backgroundColor: theme.surface }]}>
              <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "600" }}>Locked</Text>
              <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginTop: 6 }}>
                {mask(locked)}
              </Text>
            </View>
          </View>

          <Pressable onPress={() => setHideBalance((v) => !v)}>
            <Text style={[styles.equity, { color: theme.text }]}>{mask(total)}</Text>
          </Pressable>
          {earned > 0 ? (
            <View style={[styles.pnlPill, { backgroundColor: "rgba(255,107,138,0.15)" }]}>
              <Text style={{ color: theme.danger, fontWeight: "800", fontSize: 13 }}>
                Earned {mask(earned)}
              </Text>
            </View>
          ) : (
            <Text style={{ color: theme.muted, marginTop: 8, fontSize: 13 }}>Today&apos;s balance</Text>
          )}

          <View style={styles.quickRow}>
            <QuickAction
              icon="arrow-down"
              label="Deposit"
              onPress={() => navigation.navigate("Deposit")}
            />
            <QuickAction
              icon="arrow-up"
              label="Send"
              onPress={() => navigation.navigate("Withdraw")}
            />
            <QuickAction
              icon="swap-horizontal"
              label="Invest"
              onPress={() => navigateMain("Invest")}
            />
            <QuickAction
              icon="shield-checkmark"
              label="Unitrust"
              onPress={() => navigateMain("Invest", "Unitrust")}
            />
          </View>

          <View style={styles.tabs}>
            {(
              [
                ["crypto", "Crypto"],
                ["locked", "Locked"],
                ["earn", "Earn"],
              ] as const
            ).map(([key, label]) => {
              const active = assetTab === key;
              return (
                <Pressable key={key} onPress={() => setAssetTab(key)} style={styles.tabItem}>
                  <Text
                    style={{
                      color: active ? theme.text : theme.muted,
                      fontWeight: "800",
                      fontSize: 14,
                    }}
                  >
                    {label}
                  </Text>
                  {active ? (
                    <View style={[styles.tabUnderline, { backgroundColor: theme.primary }]} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {assetTab === "crypto" ? (
            <Pressable
              onPress={() => navigation.navigate("Deposit")}
              style={[styles.assetRow, { borderBottomColor: theme.divider }]}
            >
              <View style={[styles.assetIcon, { backgroundColor: "#26A17B" }]}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>T</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "800" }}>Tether</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>USDT</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: theme.text, fontWeight: "800" }}>{mask(available)}</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                  {hideBalance ? "••••" : formatUsdt(available)}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {assetTab === "locked" ? (
            <View style={[styles.assetRow, { borderBottomColor: theme.divider }]}>
              <View style={[styles.assetIcon, { backgroundColor: theme.surfaceAlt }]}>
                <Ionicons name="lock-closed" size={18} color={theme.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "800" }}>Locked</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Pending</Text>
              </View>
              <Text style={{ color: theme.text, fontWeight: "800" }}>{mask(locked)}</Text>
            </View>
          ) : null}

          {assetTab === "earn" ? (
            <Pressable
              onPress={() => navigation.navigate("Journal")}
              style={[styles.assetRow, { borderBottomColor: theme.divider }]}
            >
              <View style={[styles.assetIcon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name="pulse" size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "800" }}>Income journal</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Daily credits</Text>
              </View>
              <Text style={{ color: theme.primary, fontWeight: "800" }}>{mask(earned)}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addrPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copyBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  miniRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 18 },
  miniCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
  },
  equity: {
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1.6,
  },
  pnlPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 28,
  },
  quickItem: { alignItems: "center", width: 72 },
  quickBtn: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickLabel: { fontSize: 12, fontWeight: "600" },
  tabs: { flexDirection: "row", gap: 22, marginBottom: 8 },
  tabItem: { paddingBottom: 10 },
  tabUnderline: { height: 3, borderRadius: 2, marginTop: 8 },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
