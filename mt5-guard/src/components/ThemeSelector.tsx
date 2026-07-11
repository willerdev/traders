import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../stores/theme";
import { THEME_MODES } from "../theme/themes";

export function ThemeSelector() {
  const { mode, theme, setMode } = useTheme();

  return (
    <View style={styles.row}>
      {THEME_MODES.map((m) => {
        const active = mode === m;
        const preview = m === "dark" ? "#0a0a0a" : m === "light" ? "#ffffff" : "#121a2e";
        const ring = m === "light" ? "#d4d4d8" : "#3f3f46";
        return (
          <Pressable
            key={m}
            onPress={() => void setMode(m)}
            style={[
              styles.option,
              {
                borderColor: active ? theme.primary : theme.divider,
                backgroundColor: theme.surfaceAlt,
              },
            ]}
          >
            <View style={[styles.swatch, { backgroundColor: preview, borderColor: ring }]} />
            <Text style={[styles.label, { color: active ? theme.text : theme.muted }]}>
              {m === "dark" ? "Black" : m === "light" ? "White" : "Blue"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  option: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 2,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 6,
  },
  label: { fontSize: 12, fontWeight: "700" },
});
