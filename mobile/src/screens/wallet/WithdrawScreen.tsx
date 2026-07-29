import { useCallback, useMemo, useState } from "react";
import {
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
  const [phase, setPhase] = useState<"form" | "otp" | "track">("form");
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

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
  const stage = useMemo(() => withdrawStage(submittedStatus), [submittedStatus]);

  async function requestOtp() {
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!selectedId) {
      setError("Select a withdrawal address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.wallet.requestWithdrawOtp(value, selectedId);
      setOtpSessionId(res.sessionId);
      setOtpEmail(res.email);
      setOtpCode("");
      setPhase("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!selectedId || !otpSessionId) {
      setError("Request a verification code first");
      return;
    }
    if (otpCode.trim().length < 6) {
      setError("Enter the 6-digit email code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.wallet.withdraw(
        value,
        selectedId,
        otpSessionId,
        otpCode.trim(),
      );
      setSubmittedStatus(res.status);
      setSubmittedNet(res.netPayout);
      setPhase("track");
      setAmount("");
      setOtpCode("");
      setOtpSessionId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
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
            </Text>
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
            setOtpSessionId("");
            setOtpEmail("");
            setOtpCode("");
          }}
        />
      </ScrollView>
    );
  }

  if (phase === "otp") {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Email verification</Text>
        <Text style={{ color: theme.muted, marginBottom: 14, fontSize: 13, lineHeight: 18 }}>
          We sent a 6-digit code to {otpEmail || "your email"} to confirm withdrawing{" "}
          {formatUsdt(value)}.
        </Text>
        <SectionCard title="Code">
          <Field
            label="Verification code"
            value={otpCode}
            onChangeText={(t) => setOtpCode(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            placeholder="6-digit code"
          />
        </SectionCard>
        {error ? (
          <Text style={{ color: theme.text, marginBottom: 10, fontSize: 12 }}>
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          label={busy ? "Confirming…" : "Confirm withdrawal"}
          onPress={() => void submit()}
          disabled={busy || otpCode.trim().length < 6}
          size="sm"
        />
        <View style={{ height: 8 }} />
        <PrimaryButton
          label="Resend code"
          variant="secondary"
          size="sm"
          disabled={busy}
          onPress={() => void requestOtp()}
        />
        <View style={{ height: 8 }} />
        <PrimaryButton
          label="Back"
          variant="secondary"
          size="sm"
          disabled={busy}
          onPress={() => {
            setPhase("form");
            setOtpCode("");
            setError(null);
          }}
        />
      </ScrollView>
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
          Choose a saved wallet address, enter amount, then confirm with an email code.
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
          label={busy ? "Sending code…" : "Continue — email code"}
          onPress={() => void requestOtp()}
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
  content: { padding: 16, paddingBottom: 48 },
  stepTitle: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  selectedCoin: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
});
