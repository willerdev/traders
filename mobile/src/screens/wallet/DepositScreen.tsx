import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { Chip, Field, PrimaryButton, SectionCard } from "../../components/ui";
import { ProgressTracker } from "../../components/ProgressTracker";
import { formatUsdt, truncateMiddle } from "../../lib/format";
import type { WalletDepositCheckout } from "../../lib/types";

type Network = "TRC20" | "ERC20" | "BEP20";
type Phase = "form" | "track";

const DEPOSIT_STEPS = [
  { key: "init", label: "Initiated" },
  { key: "wait", label: "Waiting" },
  { key: "done", label: "Completed" },
];

function depositStage(opts: {
  hasCheckout: boolean;
  confirmed: boolean;
  liveStatus?: string | null;
}): { index: number; completed: boolean; label: string } {
  if (!opts.hasCheckout) return { index: 0, completed: false, label: "Ready to start" };
  if (opts.confirmed) return { index: 2, completed: true, label: "Completed" };
  const raw = (opts.liveStatus || "").toLowerCase();
  if (raw.includes("confirm") || raw.includes("waiting") || raw.includes("pending") || raw.includes("partial")) {
    return { index: 1, completed: false, label: opts.liveStatus || "Waiting for payment" };
  }
  return { index: 1, completed: false, label: opts.liveStatus || "Waiting for payment" };
}

export function DepositScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>("form");
  const [amount, setAmount] = useState("50");
  const [network, setNetwork] = useState<Network>("TRC20");
  const [minUsdt, setMinUsdt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<WalletDepositCheckout | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.wallet
      .depositMinimum(network)
      .then((r) => setMinUsdt(r.minUsdt))
      .catch(() => setMinUsdt(null));
  }, [api, network]);

  useEffect(() => {
    if (!checkout?.paymentId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await api.payments.getStatus(checkout.paymentId);
        if (cancelled) return;
        const label = st.confirmed
          ? "Completed"
          : st.progress || st.liveStatus || st.payment.status;
        setStatusLabel(label);
        if (st.confirmed) setConfirmed(true);
      } catch {
        /* keep polling */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api, checkout?.paymentId]);

  const stage = useMemo(
    () =>
      depositStage({
        hasCheckout: Boolean(checkout),
        confirmed,
        liveStatus: statusLabel ?? checkout?.liveStatus,
      }),
    [checkout, confirmed, statusLabel],
  );

  async function continueDeposit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmed(false);
    try {
      const res = await api.wallet.deposit({
        network,
        amount: value,
        method: "crypto",
      });
      setCheckout(res);
      setStatusLabel(res.liveStatus ?? "Initiated");
      setPhase("track");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    if (!checkout?.payAddress) return;
    await Clipboard.setStringAsync(checkout.payAddress);
    Alert.alert("Copied", "Deposit address copied");
  }

  if (phase === "track" && checkout) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Deposit status</Text>
        <Text style={{ color: theme.muted, marginBottom: 14, fontSize: 13, lineHeight: 18 }}>
          We track your payment automatically. Keep this screen open or return later from History.
        </Text>

        <SectionCard>
          <ProgressTracker
            steps={DEPOSIT_STEPS}
            activeIndex={stage.index}
            completed={stage.completed}
          />
          <Text style={{ color: theme.primary, textAlign: "center", marginTop: 12, fontWeight: "600", fontSize: 13 }}>
            {stage.label}
          </Text>
        </SectionCard>

        <SectionCard>
          <View style={styles.coinRow}>
            <View style={[styles.coinBadge, { backgroundColor: theme.primarySoft }]}>
              <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>USDT</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "700" }}>Tether</Text>
              <Text style={{ color: theme.muted, marginTop: 2, fontSize: 12 }}>{checkout.network}</Text>
            </View>
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {formatUsdt(checkout.payAmount ?? checkout.amount)}
            </Text>
          </View>

          <Text style={[styles.metaLabel, { color: theme.muted }]}>Deposit address</Text>
          <Pressable
            onPress={() => void copyAddress()}
            style={[styles.addressBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.divider }]}
          >
            <Text style={{ color: theme.text, flex: 1, fontWeight: "600", lineHeight: 18, fontSize: 13 }}>
              {checkout.payAddress
                ? truncateMiddle(checkout.payAddress, 16, 12)
                : "Generating address…"}
            </Text>
            <Ionicons name="copy-outline" size={16} color={theme.primary} />
          </Pressable>

          {checkout.instruction ? (
            <Text style={{ color: theme.muted, marginTop: 10, lineHeight: 18, fontSize: 12 }}>
              {checkout.instruction}
            </Text>
          ) : null}
        </SectionCard>

        <PrimaryButton label="Copy address" onPress={() => void copyAddress()} size="sm" />
        <View style={{ height: 8 }} />
        <PrimaryButton
          label="New deposit"
          variant="secondary"
          size="sm"
          onPress={() => {
            setPhase("form");
            setCheckout(null);
            setStatusLabel(null);
            setConfirmed(false);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Deposit</Text>
      <Text style={{ color: theme.muted, marginBottom: 14, fontSize: 13, lineHeight: 18 }}>
        Select chain and amount, then send USDT to the generated address.
      </Text>

      <SectionCard>
        <ProgressTracker steps={DEPOSIT_STEPS} activeIndex={0} completed={false} />
      </SectionCard>

      <SectionCard title="Coin">
        <View style={[styles.selectedCoin, { backgroundColor: theme.surfaceAlt, borderColor: theme.primary }]}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>USDT</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Tether</Text>
        </View>
      </SectionCard>

      <SectionCard title="Chain">
        <View style={styles.chips}>
          {(["TRC20", "ERC20", "BEP20"] as Network[]).map((n) => (
            <Chip key={n} label={n} active={network === n} onPress={() => setNetwork(n)} />
          ))}
        </View>
        {minUsdt != null ? (
          <Text style={{ color: theme.muted, marginTop: 10, fontSize: 11 }}>
            Minimum · {formatUsdt(minUsdt)}
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard title="Amount">
        <Field
          label="Deposit amount (USDT)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0.00"
        />
        {error ? <Text style={{ color: theme.text, marginBottom: 8, fontSize: 12 }}>{error}</Text> : null}
        <PrimaryButton
          label={busy ? "Creating…" : "Continue"}
          onPress={() => void continueDeposit()}
          disabled={busy}
          size="sm"
        />
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  stepTitle: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectedCoin: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coinRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  coinBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  metaLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  addressBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
