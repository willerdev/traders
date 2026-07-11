import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../stores/theme";

export function Screen({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={["top"]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.divider },
      ]}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  color,
  stretch,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  stretch?: boolean;
}) {
  const { theme } = useTheme();
  const bg = color ?? theme.primary;
  const labelColor =
    color != null
      ? "#ffffff"
      : theme.mode === "dark"
        ? theme.bg
        : "#ffffff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        stretch && styles.btnStretch,
        {
          backgroundColor: bg,
          opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text style={[styles.btnText, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  stretch,
}: {
  label: string;
  onPress: () => void;
  stretch?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryBtn,
        stretch && styles.btnStretch,
        {
          borderColor: theme.divider,
          backgroundColor: pressed ? theme.surfaceAlt : "transparent",
        },
      ]}
    >
      <Text style={[styles.secondaryText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.muted }]}>{children}</Text>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.surfaceAlt, borderColor: theme.divider }]}>
      <Text style={[styles.emptyTitle, { color: theme.muted }]}>{title}</Text>
      {hint ? <Text style={[styles.emptyHint, { color: theme.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

export function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCell, { backgroundColor: theme.surfaceAlt, borderColor: theme.divider }]}>
      <Text style={[styles.statLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent ?? theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    marginBottom: 12,
  },
  btn: {
    alignSelf: "stretch",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnStretch: { flex: 1 },
  btnText: { fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    alignSelf: "stretch",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryText: { fontWeight: "600", fontSize: 15 },
  label: {
    fontSize: 11,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "600",
  },
  empty: {
    padding: 28,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 14, fontWeight: "600" },
  emptyHint: { fontSize: 12, marginTop: 6, textAlign: "center" },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  statCell: {
    width: "47%",
    flexGrow: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  statLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  statValue: { fontSize: 16, fontWeight: "700", marginTop: 4 },
});
