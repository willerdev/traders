import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../stores/theme";

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = "primary",
  size = "md",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const { theme } = useTheme();
  const bg =
    variant === "secondary"
      ? theme.surfaceAlt
      : variant === "ghost" || variant === "danger"
        ? "transparent"
        : theme.primary;
  const color =
    variant === "ghost"
      ? theme.primary
      : variant === "danger"
        ? theme.text
        : variant === "secondary"
          ? theme.text
          : theme.onPrimary;
  const border =
    variant === "ghost" || variant === "danger" || variant === "secondary"
      ? theme.divider
      : bg;
  const compact = size === "sm";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnSm,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text style={[styles.btnText, compact && styles.btnTextSm, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  editable = true,
  right,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "number-pad" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  right?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.divider,
            opacity: editable ? 1 : 0.6,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: theme.text, flex: 1 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
        />
        {right}
      </View>
    </View>
  );
}

export function ScreenState({
  loading,
  error,
  empty,
  emptyLabel = "Nothing here yet",
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.stateText, { color: theme.text }]}>{error}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} style={{ marginTop: 12 }}>
            <Text style={{ color: theme.primary, fontWeight: "700" }}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={[styles.stateText, { color: theme.muted }]}>{emptyLabel}</Text>
      </View>
    );
  }
  return <>{children}</>;
}

export function SectionCard({
  title,
  children,
  right,
  padded = true,
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  padded?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.divider,
          padding: padded ? 16 : 0,
        },
      ]}
    >
      {(title || right) && (
        <View style={[styles.cardHeader, !padded && { paddingHorizontal: 16, paddingTop: 16 }]}>
          {title ? <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function MoneyRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.moneyRow}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          color: theme.text,
          fontSize: emphasize ? 22 : 15,
          fontWeight: emphasize ? "800" : "600",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.primarySoft : theme.surfaceAlt,
          borderColor: active ? theme.primary : theme.divider,
        },
      ]}
    >
      <Text style={{ color: active ? theme.primary : theme.text, fontWeight: "700", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ActionIconButton({
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
    <Pressable onPress={onPress} style={styles.actionWrap}>
      <View style={[styles.actionCircle, { backgroundColor: theme.iconBtn }]}>
        <Ionicons name={icon} size={22} color={theme.primary} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  value,
  onPress,
  showChevron,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.listRow, { borderBottomColor: theme.divider }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: theme.muted, marginTop: 2, fontSize: 11 }}>{subtitle}</Text>
        ) : null}
      </View>
      {value ? (
        <Text style={{ color: theme.text, fontWeight: "700", marginRight: showChevron ? 6 : 0 }}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={theme.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderWidth: 1,
  },
  btnSm: {
    minHeight: 36,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { fontWeight: "600", fontSize: 14 },
  btnTextSm: { fontSize: 13 },
  fieldWrap: { marginBottom: 10 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    fontSize: 14,
    paddingVertical: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  stateText: { textAlign: "center", fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: "700" },
  moneyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionWrap: { alignItems: "center", width: 68 },
  actionCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  actionLabel: { fontSize: 11, fontWeight: "600" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
