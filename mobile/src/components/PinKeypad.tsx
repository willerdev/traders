import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../stores/theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinDots({ length, filled }: { length: number; filled: number }) {
  const { theme } = useTheme();
  return (
    <View style={styles.dots}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < filled ? theme.primary : theme.surfaceAlt,
              borderColor: i < filled ? theme.primary : theme.divider,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function PinKeypad({
  onDigit,
  onDelete,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.pad}>
      {KEYS.map((key, idx) => {
        if (key === "") return <View key={`empty-${idx}`} style={styles.key} />;
        if (key === "del") {
          return (
            <Pressable
              key="del"
              onPress={onDelete}
              style={[styles.key, { backgroundColor: theme.surfaceAlt }]}
            >
              <Ionicons name="backspace-outline" size={22} color={theme.text} />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={key}
            onPress={() => onDigit(key)}
            style={[styles.key, { backgroundColor: theme.surfaceAlt }]}
          >
            <Text style={[styles.keyText, { color: theme.text }]}>{key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginVertical: 28,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    paddingHorizontal: 12,
  },
  key: {
    width: "30%",
    aspectRatio: 1.35,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: { fontSize: 28, fontWeight: "700" },
});
