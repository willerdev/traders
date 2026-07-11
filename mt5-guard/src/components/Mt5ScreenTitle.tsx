import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useTheme } from "../stores/theme";
import { Mt5AccountModeBadge } from "./Mt5AccountModeBadge";
import type { Mt5AccountMode } from "../lib/mt5-account-mode";
import type { MainTabParamList } from "../navigation/types";

type Props = {
  title: string;
  mode?: Mt5AccountMode;
  modeDetail?: string | null;
  syncing?: boolean;
  showSettings?: boolean;
  showBadge?: boolean;
};

export function Mt5ScreenTitle({
  title,
  mode,
  modeDetail,
  syncing,
  showSettings = false,
  showBadge = false,
}: Props) {
  const { theme } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {showBadge && mode ? (
          <Mt5AccountModeBadge mode={mode} detail={modeDetail} />
        ) : null}
        {syncing ? (
          <Text style={[styles.sync, { color: theme.primary }]}>· syncing</Text>
        ) : null}
      </View>
      {showSettings ? (
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={[styles.gear, { backgroundColor: theme.surfaceAlt, borderColor: theme.divider }]}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={theme.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  left: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, flex: 1 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  sync: { fontSize: 11, fontWeight: "600" },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
