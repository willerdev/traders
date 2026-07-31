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
  loading,
  variant = "primary",
  size = "md",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
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
        ? theme.danger
        : variant === "secondary"
          ? theme.text
          : theme.onPrimary;
  const border =
    variant === "danger"
      ? theme.danger
      : variant === "ghost" || variant === "secondary"
        ? theme.divider
        : bg;
  const compact = size === "sm";
  const busy = Boolean(loading || disabled);

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnSm,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: busy ? 0.5 : pressed ? 0.88 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.btnText, compact && styles.btnTextSm, { color }]}>{label}</Text>
      )}
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
        <Text style={[styles.stateText, { color: theme.danger }]}>{error}</Text>
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
          backgroundColor: active ? theme.primary : theme.surfaceAlt,
          borderColor: active ? theme.primary : theme.divider,
        },
      ]}
    >
      <Text
        style={{
          color: active ? theme.onPrimary : theme.text,
          fontWeight: "700",
          fontSize: 13,
        }}
      >
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
      <View style={[styles.actionCircle, { backgroundColor: theme.primary }]}>
        <Ionicons name={icon} size={22} color={theme.onPrimary} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Full-width stacked action row — generous spacing between parallel vertical buttons. */
export function VerticalActionCard({
  icon,
  title,
  subtitle,
  onPress,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accent?: boolean;
}) {
  const { theme } = useTheme();
  const bg = accent ? theme.primary : theme.surface;
  const titleColor = accent ? theme.onPrimary : theme.text;
  const subColor = accent ? "rgba(255,255,255,0.78)" : theme.muted;
  const iconBg = accent ? "rgba(255,255,255,0.18)" : theme.primarySoft;
  const iconColor = accent ? theme.onPrimary : theme.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.verticalCard,
        {
          backgroundColor: bg,
          borderColor: accent ? theme.primary : theme.divider,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.verticalIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: titleColor, fontWeight: "800", fontSize: 16 }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: subColor, marginTop: 4, fontSize: 13, lineHeight: 18 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={accent ? "rgba(255,255,255,0.7)" : theme.muted}
      />
    </Pressable>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const { theme } = useTheme();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.primaryMuted }]}>
      <View
        style={[
          styles.progressFill,
          { backgroundColor: theme.primary, width: `${Math.round(pct * 100)}%` },
        ]}
      />
    </View>
  );
}

export function BrandMark({ size = "lg" }: { size?: "sm" | "lg" }) {
  const { theme } = useTheme();
  const large = size === "lg";
  return (
    <Text
      style={{
        color: theme.text,
        fontSize: large ? 36 : 22,
        fontWeight: "900",
        letterSpacing: -1.2,
      }}
      accessibilityRole="header"
    >
      tradeguard
    </Text>
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
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    borderWidth: 1,
  },
  btnSm: {
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 22,
  },
  btnText: { fontWeight: "800", fontSize: 16 },
  btnTextSm: { fontSize: 14 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    fontSize: 16,
    paddingVertical: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  stateText: { textAlign: "center", fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 20,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  moneyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionWrap: { alignItems: "center", width: 72 },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionLabel: { fontSize: 12, fontWeight: "600" },
  verticalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 28,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  verticalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
