import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../stores/theme";
import { WEB_APP_URL } from "../config/env";
import type { MoreStackParamList } from "../navigation/types";

type Item = {
  key: string;
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function MoreScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const items: Item[] = [
    {
      key: "chain",
      title: "Chain vault",
      hint: "On-chain enroll, KYC & launch",
      icon: "cube",
      onPress: () => navigation.navigate("ChainEnroll"),
    },
    {
      key: "mt5",
      title: "MT5",
      hint: "Quotes, charts & trade on web",
      icon: "stats-chart",
      onPress: () => void Linking.openURL(`${WEB_APP_URL}/mt5`),
    },
    {
      key: "messages",
      title: "Support",
      hint: "Agent & admin chat",
      icon: "chatbubbles",
      onPress: () => navigation.navigate("MessagesMain"),
    },
    {
      key: "payouts",
      title: "Payouts",
      hint: "Trader payout history",
      icon: "cash",
      onPress: () => navigation.navigate("Payouts"),
    },
    {
      key: "terms",
      title: "Terms & Conditions",
      hint: "Withdrawals, vault & risk",
      icon: "document-text",
      onPress: () => navigation.navigate("Terms"),
    },
    {
      key: "settings",
      title: "Settings",
      hint: "Profile, theme & account",
      icon: "settings",
      onPress: () => navigation.navigate("SettingsMain"),
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["top"]}>
      <Text style={[styles.title, { color: theme.text }]}>More</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>
        Chain, MT5, support, payouts & account
      </Text>
      <ScrollView contentContainerStyle={styles.content}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: theme.surface,
                borderColor: theme.divider,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name={item.icon} size={20} color={theme.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{item.title}</Text>
              <Text style={[styles.rowHint, { color: theme.muted }]}>{item.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    paddingHorizontal: 20,
    paddingTop: 8,
    letterSpacing: -0.4,
  },
  sub: { fontSize: 13, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowHint: { fontSize: 12, marginTop: 2 },
});
