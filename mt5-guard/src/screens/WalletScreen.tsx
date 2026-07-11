import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { useAppActive } from "../hooks/use-app-active-polling";
import { formatCurrency, fmtDate } from "../lib/format";
import type { SavedWithdrawalWallet, WalletLedgerItem, WalletSummary, WithdrawalWalletNetwork } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import {
  Card,
  EmptyState,
  FieldLabel,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatCell,
  StatGrid,
} from "../components/ui";

export function WalletScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const focused = useIsFocused();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<WalletLedgerItem[]>([]);
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const [s, t, w] = await Promise.all([
        api.wallet.summary(),
        api.wallet.transactions(50, 0),
        api.wallet.withdrawalWallets().catch(() => ({ items: [] as SavedWithdrawalWallet[] })),
      ]);
      setSummary(s);
      setTxs(t.items ?? []);
      setWallets(w.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load wallet");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useAppActive(() => void load(true), focused, 4000);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.primary} />
        }
      >
        <PageHeader title="Wallet" subtitle="Deposits, withdrawals & history" />

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.error }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        ) : null}

        <Card>
          <Text style={[styles.balanceLabel, { color: theme.muted }]}>Available balance</Text>
          <Text style={[styles.balance, { color: theme.text }]}>
            {summary ? formatCurrency(summary.availableBalance) : loading ? "…" : "—"}
          </Text>
          {summary?.activePlan ? (
            <View style={[styles.planPill, { backgroundColor: theme.chipActiveBg, borderColor: theme.emerald }]}>
              <Text style={[styles.planText, { color: theme.emerald }]}>
                Depositor · {summary.activePlan.riskPercent}% risk · {summary.activePlan.dailyYieldPercent}% daily
              </Text>
            </View>
          ) : null}
          <StatGrid>
            <StatCell label="Locked" value={summary ? formatCurrency(summary.lockedBalance) : "—"} />
            <StatCell label="Withdrawn" value={summary ? formatCurrency(summary.totalWithdrawn) : "—"} />
            <StatCell label="Deposited" value={summary ? formatCurrency(summary.totalDeposited) : "—"} />
            <StatCell
              label="Earned"
              value={summary ? formatCurrency(summary.totalEarned) : "—"}
              accent={theme.emerald}
            />
          </StatGrid>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton label="Deposit" onPress={() => setDepositOpen(true)} color={theme.buy} stretch />
          <SecondaryButton label="Withdraw" onPress={() => setWithdrawOpen(true)} stretch />
        </View>

        <Text style={[styles.section, { color: theme.muted }]}>Transactions</Text>
        {txs.length === 0 && !loading ? (
          <EmptyState title="No transactions yet" hint="Deposits and withdrawals will appear here" />
        ) : (
          txs.map((tx) => (
            <View key={tx.id} style={[styles.txRow, { borderBottomColor: theme.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.txDesc, { color: theme.text }]}>{tx.description}</Text>
                <Text style={[styles.txDate, { color: theme.muted }]}>{fmtDate(tx.createdAt)}</Text>
              </View>
              <Text
                style={[
                  styles.txAmt,
                  { color: tx.amount >= 0 ? theme.buy : theme.sell },
                ]}
              >
                {tx.amount >= 0 ? "+" : ""}
                {formatCurrency(tx.amount)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <DepositModal visible={depositOpen} onClose={() => setDepositOpen(false)} onDone={() => void load()} />
      <WithdrawModal
        visible={withdrawOpen}
        wallets={wallets}
        onClose={() => setWithdrawOpen(false)}
        onDone={() => void load()}
      />
    </Screen>
  );
}

function useStyles() {
  const { theme } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        content: { paddingHorizontal: 20, paddingBottom: 32 },
        errorBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
        errorText: { fontSize: 13 },
        balanceLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
        balance: { fontSize: 36, fontWeight: "800", marginTop: 6, letterSpacing: -1 },
        planPill: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
        planText: { fontSize: 12, fontWeight: "600" },
        actions: { flexDirection: "row", gap: 10, marginVertical: 8 },
        section: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginBottom: 10, marginTop: 8 },
        txRow: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1 },
        txDesc: { fontSize: 14, fontWeight: "500" },
        txDate: { fontSize: 11, marginTop: 3 },
        txAmt: { fontWeight: "700", fontSize: 14 },
        modalOverlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" },
        modalSheet: {
          backgroundColor: theme.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 24,
          gap: 10,
          borderTopWidth: 1,
          borderColor: theme.divider,
        },
        modalTitle: { color: theme.text, fontSize: 20, fontWeight: "800", marginBottom: 4 },
        input: {
          backgroundColor: theme.inputBg,
          borderWidth: 1,
          borderColor: theme.divider,
          borderRadius: 12,
          padding: 14,
          color: theme.text,
          fontSize: 16,
        },
        networkRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
        chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.divider },
        chipActive: { borderColor: theme.buy, backgroundColor: theme.chipActiveBg },
        chipText: { color: theme.text, fontSize: 13, fontWeight: "600" },
        result: { color: theme.emerald, fontSize: 13 },
        muted: { color: theme.muted, fontSize: 13 },
        walletRow: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.divider, marginBottom: 8 },
        walletActive: { borderColor: theme.buy, backgroundColor: theme.chipActiveBg },
        walletLabel: { color: theme.text, fontWeight: "600" },
        walletAddr: { color: theme.muted, fontSize: 11, marginTop: 2 },
        error: { color: theme.error, marginBottom: 4, fontSize: 13 },
      }),
    [theme],
  );
}

function DepositModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const styles = useStyles();
  const [network, setNetwork] = useState<WithdrawalWalletNetwork>("TRC20");
  const [amount, setAmount] = useState("");
  const [risk, setRisk] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.wallet.deposit({
        network,
        amount: amt,
        riskPercent: Number(risk) || 5,
      });
      const addr = (res as { payAddress?: string }).payAddress;
      setResult(addr ? `Send USDT to: ${addr}` : "Deposit initiated — check email or web wallet.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Deposit</Text>
          <FieldLabel>Network</FieldLabel>
          <View style={styles.networkRow}>
            {(["TRC20", "ERC20", "BEP20"] as const).map((n) => (
              <Pressable
                key={n}
                onPress={() => setNetwork(n)}
                style={[styles.chip, network === n && styles.chipActive]}
              >
                <Text style={styles.chipText}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel>Amount (USDT)</FieldLabel>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.muted}
          />
          <FieldLabel>Risk % (depositor plan)</FieldLabel>
          <TextInput
            style={styles.input}
            value={risk}
            onChangeText={setRisk}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.muted}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {result ? <Text style={styles.result}>{result}</Text> : null}
          <PrimaryButton label={busy ? "…" : "Continue"} onPress={() => void submit()} disabled={busy} color={theme.buy} />
          <SecondaryButton label="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function WithdrawModal({
  visible,
  wallets,
  onClose,
  onDone,
}: {
  visible: boolean;
  wallets: SavedWithdrawalWallet[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { api } = useAuth();
  const styles = useStyles();
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<string | null>(wallets[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (wallets[0]) setWalletId(wallets[0].id);
  }, [wallets]);

  async function submit() {
    const amt = Number(amount);
    if (!walletId) {
      setError("Add a verified withdrawal wallet in Settings first");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.wallet.withdraw({ amount: amt, savedWalletId: walletId });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Withdraw</Text>
          {wallets.length === 0 ? (
            <Text style={styles.muted}>No verified wallets — add one in Settings.</Text>
          ) : (
            <>
              <FieldLabel>Saved wallet</FieldLabel>
              {wallets.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => setWalletId(w.id)}
                  style={[styles.walletRow, walletId === w.id && styles.walletActive]}
                >
                  <Text style={styles.walletLabel}>{w.label}</Text>
                  <Text style={styles.walletAddr}>{w.address.slice(0, 12)}… · {w.network}</Text>
                </Pressable>
              ))}
            </>
          )}
          <FieldLabel>Amount</FieldLabel>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholderTextColor={theme.muted}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={busy ? "…" : "Withdraw"} onPress={() => void submit()} disabled={busy} />
          <SecondaryButton label="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
