import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../stores/theme";
import { usePin } from "../stores/pin";
import { PinDots, PinKeypad } from "../components/PinKeypad";
import { BrandMark } from "../components/ui";

export function PinGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { ready, hasPin, unlocked, setPin, unlock } = usePin();
  const [mode, setMode] = useState<"create" | "confirm" | "unlock">("create");
  const [draft, setDraft] = useState("");
  const [pendingCreate, setPendingCreate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || unlocked) return;
    setMode(hasPin ? "unlock" : "create");
    setDraft("");
    setPendingCreate("");
    setError(null);
  }, [ready, hasPin, unlocked]);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (unlocked) return <>{children}</>;

  const title =
    mode === "unlock"
      ? "Enter passcode"
      : mode === "confirm"
        ? "Confirm passcode"
        : "Create a passcode";
  const subtitle =
    mode === "unlock"
      ? "Enter your 6-digit PIN to unlock"
      : "Set a 6-digit PIN to unlock the app and confirm withdrawals";

  async function onComplete(code: string) {
    setBusy(true);
    setError(null);
    try {
      if (mode === "unlock") {
        await unlock(code);
      } else if (mode === "create") {
        setPendingCreate(code);
        setDraft("");
        setMode("confirm");
      } else {
        if (code !== pendingCreate) {
          setError("PINs do not match — try again");
          setDraft("");
          setPendingCreate("");
          setMode("create");
          return;
        }
        await setPin(code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN failed");
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  function pushDigit(d: string) {
    if (busy) return;
    const next = (draft + d).slice(0, 6);
    setDraft(next);
    if (next.length === 6) void onComplete(next);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.top}>
        <BrandMark size="sm" />
      </View>
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: "#5B4BDB" }]}>
          <Ionicons name="lock-closed" size={22} color="#fff" />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>{subtitle}</Text>
        <PinDots length={6} filled={draft.length} />
        {error ? <Text style={{ color: theme.error, marginBottom: 12 }}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={theme.primary} /> : null}
      </View>
      <PinKeypad
        onDigit={pushDigit}
        onDelete={() => setDraft((v) => v.slice(0, -1))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingBottom: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { paddingHorizontal: 24, paddingTop: 8 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6, textAlign: "center" },
  sub: { marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 280 },
});
