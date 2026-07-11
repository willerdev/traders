import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "../stores/theme";
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
  const { theme } = useTheme();
  const isReal = mode === "real";
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isReal ? `${theme.emerald}22` : `${theme.amber}22`,
          borderColor: isReal ? theme.emerald : theme.amber,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: isReal ? theme.emerald : theme.amber }]}>
        {isReal ? "Real" : "Demo"}
        {detail ? ` · ${detail}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  text: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
});
