import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import type { Mt5AccountMode } from "../lib/mt5-account-mode";

export function Mt5AccountModeBadge({
  mode,
  detail,
  style,
}: {
  mode: Mt5AccountMode;
  detail?: string | null;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.badge,
        mode === "real" ? styles.real : styles.demo,
        style,
      ]}
    >
      <Text style={[styles.text, mode === "real" ? styles.realText : styles.demoText]}>
        {mode === "real" ? "Real" : "Demo"}
        {detail ? ` · ${detail}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  real: { backgroundColor: "rgba(52,211,153,0.15)" },
  demo: { backgroundColor: "rgba(251,191,36,0.15)" },
  text: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  realText: { color: colors.emerald },
  demoText: { color: colors.amber },
});
