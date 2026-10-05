import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "../stores/theme";

export function Mt5AccountModeBadge({
  detail,
  style,
}: {
  mode?: string;
  detail?: string | null;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  if (!detail) return null;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${theme.muted}22`,
          borderColor: theme.divider,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: theme.muted }]}>{detail}</Text>
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
  text: { fontSize: 10, fontWeight: "600" },
});
