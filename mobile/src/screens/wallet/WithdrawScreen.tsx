import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { Chip, Field, PrimaryButton, ScreenState, SectionCard } from "../../components/ui";
import { PinDots, PinKeypad } from "../../components/PinKeypad";
import { ProgressTracker } from "../../components/ProgressTracker";
import { formatUsdt, truncateMiddle } from "../../lib/format";
import type { SavedWithdrawalWallet, WalletSummary } from "../../lib/types";
import type { WalletStackParamList } from "../../navigation/types";
import * as Linking from "expo-linking";
import { WEB_APP_URL } from "../../config/env";

const WITHDRAW_STEPS = [
  { key: "init", label: "Initiated" },
  { key: "wait", label: "Waiting" },
  { key: "done", label: "Completed" },
];

function withdrawStage(status?: string | null): { index: number; completed: boolean; label: string } {
  const raw = (status || "").toUpperCase();
  if (!raw) return { index: 0, completed: false, label: "Ready to submit" };
  if (["COMPLETED", "PAID", "APPROVED", "SUCCESS"].some((s) => raw.includes(s))) {
    return { index: 2, completed: true, label: status || "Completed" };
  }
  if (["PENDING", "PROCESSING", "SUBMITTED", "REQUESTED", "QUEUED"].some((s) => raw.includes(s))) {
    return { index: 1, completed: false, label: status || "Waiting for processing" };
  }
  return { index: 1, completed: false, label: status || "Submitted" };
}

export function WithdrawScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<WalletStackParamList>>();
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);
  const [submittedNet, setSubmittedNet] = useState<number | null>(null);
  const [phase, setPhase] = useState<"form" | "pin" | "track">("form");
  const [pinCode, setPinCode] = useState("");
  const [p2pId, setP2pId] = useState<string | null>(null);
  const [p2pUgx, setP2pUgx] = useState<number | null>(null);
  const [momoQuoteUgx, setMomoQuoteUgx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, walletSummary] = await Promise.all([
        api.wallet.withdrawalWallets(),
        api.wallet.summary(),
      ]);
      setWallets(list);
      setSummary(walletSummary);
      if (list[0]) setSelectedId((prev) => prev ?? list[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selected = wallets.find((w) => w.id === selectedId) ?? null;
  const isMomo =
    selected?.network === "MOMO_MTN" || selected?.network === "MOMO_AIRTEL";
  const available = summary?.availableBalance ?? 0;
  const processingFee = summary?.withdrawalFeeUsdt ?? 0;
  const scheduleEnabled = summary?.withdrawalScheduleEnabled !== false;
  const inWindow = summary?.withdrawalInPreferredWindow !== false;
  const penaltyPercent =
    scheduleEnabled && !inWindow
      ? Number(summary?.withdrawalOffSchedulePenaltyPercent ?? 8)
      : 0;
  const value = Number(amount);
  const penaltyUsdt =
    Number.isFinite(value) && value > 0
      ? Math.round(((value * penaltyPercent) / 100) * 100) / 100
      : 0;
  const totalFees = Math.round((processingFee + penaltyUsdt) * 100) / 100;
  const net =
    Number.isFinite(value) && value > 0 ? Math.max(value - totalFees, 0) : 0;
  const windowLabel =
    summary?.withdrawalPreferredWindowLabel ??
    (String(summary?.withdrawalPreferredSchedule).toUpperCase() === "MONTHLY"
      ? "the 1st of each month (UTC)"
      : "Sundays (UTC)");
  const nextWindow = summary?.withdrawalNextPreferredWindowAt
    ? new Date(summary.withdrawalNextPreferredWindowAt).toLocaleString()
    : null;
  const stage = useMemo(() => {
    if (p2pId && submittedStatus === "momo_p2p") {
      return {
        index: 1,
        completed: false,
        label: "Under process — MoMo P2P",
      };
    }
    return withdrawStage(submittedStatus);
  }, [submittedStatus, p2pId]);

  useFocusEffect(
    useCallback(() => {
      if (!isMomo || !(net > 0)) {
        setMomoQuoteUgx(null);
        return;
      }
      let alive = true;
      void api.wallet
        .momoP2pQuote(net)
        .then((q) => {
          if (alive) setMomoQuoteUgx(q.amountUgx);
        })
        .catch(() => {
          if (alive) setMomoQuoteUgx(null);
        });
      return () => {
        alive = false;
      };
    }, [api, isMomo, net]),
  );
  async function goConfirmPin() {
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!selectedId) {
      setError("Select a withdrawal address");
      return;
    }
    setError(null);
    setPinCode("");
    setPhase("pin");
  }

  async function submitWithPin(code: string) {
    if (!selectedId) {
      setError("Select a withdrawal address");
      return;
    }
    if (code.trim().length < 6) {
      setError("Enter your 6-digit PIN");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.wallet.withdraw(value, selectedId, { pin: code.trim() });
      setSubmittedStatus(res.status);
      setSubmittedNet(res.netPayout);
      if (res.status === "momo_p2p" && res.p2pId) {
        setP2pId(res.p2pId);
        setP2pUgx(res.amountUgx ?? res.p2p?.amountUgx ?? null);
      } else {
        setP2pId(null);
        setP2pUgx(null);
      }
      setPhase("track");
      setAmount("");
      setPinCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
      setPinCode("");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "track") {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Withdraw status</Text>
        <Text style={{ color: theme.muted, marginBottom: 14, fontSize: 13, lineHeight: 18 }}>
          Your request is tracked below. KYC may be required before funds are released.
        </Text>
        <SectionCard>
          <ProgressTracker
            steps={WITHDRAW_STEPS}
            activeIndex={stage.index}
            completed={stage.completed}
          />
          <Text style={{ color: theme.primary, textAlign: "center", marginTop: 12, fontWeight: "600", fontSize: 13 }}>
            {stage.label}
          </Text>
          {submittedNet != null ? (
            <Text style={{ color: theme.muted, textAlign: "center", marginTop: 8, fontSize: 12 }}>
              Net payout · {formatUsdt(submittedNet)}
              {p2pUgx != null
                ? ` · ~UGX ${Math.round(p2pUgx).toLocaleString()}`
                : ""}
            </Text>
          ) : null}
          {p2pId ? (
            <>
              <View style={{ height: 12 }} />
              <PrimaryButton
                label="Confirm MoMo arrived"
                loading={busy}
                onPress={() => {
                  setBusy(true);
                  void api.wallet
                    .momoP2pConfirmReceived(p2pId)
                    .then(() => {
                      setSubmittedStatus("COMPLETED");
                      setP2pId(null);
                      Alert.alert("Confirmed", "MoMo arrival recorded.");
                    })
                    .catch((err) =>
                      setError(
                        err instanceof Error ? err.message : "Confirm failed",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              />
            </>
          ) : null}
        </SectionCard>
        <PrimaryButton
          label="View history"
          size="sm"
          onPress={() => navigation.navigate("Transactions")}
        />
        <View style={{ height: 8 }} />
        <PrimaryButton
          label="New withdrawal"
          variant="secondary"
          size="sm"
          onPress={() => {
            setPhase("form");
            setSubmittedStatus(null);
            setSubmittedNet(null);
            setP2pId(null);
            setP2pUgx(null);
            setPinCode("");
          }}
        />
      </ScrollView>
    );
  }

  if (phase === "pin") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.stepTitle, { color: theme.text }]}>Confirm with PIN</Text>
          <Text style={{ color: theme.muted, marginBottom: 8, fontSize: 15, lineHeight: 22 }}>
            Enter your app PIN to withdraw {formatUsdt(value)}.
          </Text>
          <PinDots length={6} filled={pinCode.length} />
          {error ? (
            <Text style={{ color: theme.error, marginBottom: 12, textAlign: "center" }}>
              {error}
            </Text>
          ) : null}
          {busy ? <ActivityIndicator color={theme.primary} style={{ marginBottom: 12 }} /> : null}
        </ScrollView>
        <View style={{ paddingBottom: 20 }}>
          <PinKeypad
            onDigit={(d) => {
              if (busy) return;
              const next = (pinCode + d).slice(0, 6);
              setPinCode(next);
              if (next.length === 6) void submitWithPin(next);
            }}
            onDelete={() => setPinCode((v) => v.slice(0, -1))}
          />
          <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
            <PrimaryButton
              label="Back"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setPhase("form");
                setPinCode("");
                setError(null);
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScreenState
      loading={loading}
      error={error && wallets.length === 0 ? error : null}
      onRetry={() => void load()}
    >
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Withdraw</Text>
        <Text style={{ color: theme.muted, marginBottom: 14, fontSize: 13, lineHeight: 18 }}>
          Choose a saved wallet address, enter amount, then confirm with your app PIN.
        </Text>

        <SectionCard>
          <ProgressTracker steps={WITHDRAW_STEPS} activeIndex={0} completed={false} />
        </SectionCard>

        <SectionCard title="Coin">
          <View style={[styles.selectedCoin, { backgroundColor: theme.surfaceAlt, borderColor: theme.primary }]}>
            <Text style={{ color: theme.text, fontWeight: "700" }}>USDT</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Available {formatUsdt(available)}</Text>
          </View>
        </SectionCard>

        <SectionCard
          title="Address"
          right={
            <Pressable onPress={() => navigation.navigate("SavedWallets")}>
              <Text style={{ color: theme.primary, fontWeight: "600", fontSize: 12 }}>Add wallet</Text>
            </Pressable>
          }
        >
          {wallets.length === 0 ? (
            <>
              <Text style={{ color: theme.muted, marginBottom: 10, lineHeight: 18, fontSize: 13 }}>
                No saved withdrawal addresses yet.
              </Text>
              <PrimaryButton
                label="Add wallet"
                variant="secondary"
                size="sm"
                onPress={() => navigation.navigate("SavedWallets")}
              />
            </>
          ) : (
            <View style={{ gap: 8 }}>
              {wallets.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => setSelectedId(w.id)}
                  style={[
                    styles.walletRow,
                    {
                      borderColor: selectedId === w.id ? theme.primary : theme.divider,
                      backgroundColor:
                        selectedId === w.id ? theme.primarySoft : theme.surfaceAlt,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13 }}>
                    {w.label} · {w.network}
                  </Text>
                  <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>
                    {truncateMiddle(w.address, 10, 8)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </SectionCard>

        {selected ? (
          <SectionCard title="Chain">
            <Chip label={selected.network} active onPress={() => undefined} />
          </SectionCard>
        ) : null}

        <SectionCard title="Amount">
          <Field
            label="Withdraw amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0.00"
            right={
              <Pressable onPress={() => setAmount(String(available))}>
                <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13 }}>Max</Text>
              </Pressable>
            }
          />
          <View style={styles.feeRow}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Processing fee</Text>
            <Text style={{ color: theme.text, fontWeight: "600", fontSize: 12 }}>
              {formatUsdt(processingFee)}
            </Text>
          </View>
          {scheduleEnabled ? (
            <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 6, lineHeight: 17 }}>
              Preferred: {windowLabel}
              {inWindow
                ? " · in-window (no off-schedule penalty)"
                : ` · off-schedule (+${penaltyPercent}% penalty)`}
              {nextWindow ? `\nNext window: ${nextWindow}` : ""}
              {summary?.vipActive ? "\nVIP: $0 processing fee (penalty still applies off-schedule)." : ""}
            </Text>
          ) : null}
          {isMomo && momoQuoteUgx != null ? (
            <Text style={{ color: theme.primary, fontSize: 12, marginBottom: 6, lineHeight: 17 }}>
              MoMo P2P preview · ~UGX {Math.round(momoQuoteUgx).toLocaleString()} (Binance rate)
            </Text>
          ) : null}
          {penaltyUsdt > 0 ? (
            <View style={styles.feeRow}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Off-schedule penalty</Text>
              <Text style={{ color: theme.text, fontWeight: "600", fontSize: 12 }}>
                {formatUsdt(penaltyUsdt)}
              </Text>
            </View>
          ) : null}
          <View style={styles.feeRow}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>You receive</Text>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>
              {formatUsdt(net)}
            </Text>
          </View>
        </SectionCard>

        {error && wallets.length > 0 ? (
          <Text style={{ color: theme.text, marginBottom: 10, fontSize: 12 }}>{error}</Text>
        ) : null}

        <PrimaryButton
          label={busy ? "…" : "Continue — confirm PIN"}
          onPress={() => void goConfirmPin()}
          disabled={busy || !selectedId}
          size="sm"
        />
        <Pressable
          onPress={() => void Linking.openURL(`${WEB_APP_URL}/terms#withdrawals`)}
          style={{ marginTop: 14 }}
        >
          <Text style={{ color: theme.primary, fontWeight: "600", fontSize: 12 }}>
            Read withdrawal terms →
          </Text>
        </Pressable>
      </ScrollView>
    </ScreenState>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  stepTitle: { fontSize: 28, fontWeight: "900", marginBottom: 10, letterSpacing: -0.6 },
  selectedCoin: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletRow: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
});
