import { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "../stores/auth";
import { formatCurrency, fmtDate } from "../lib/format";
import { colors } from "../theme/colors";
import type { SavedWithdrawalWallet, WalletLedgerItem, WalletSummary, WithdrawalWalletNetwork } from "../lib/types";
import { Card, EmptyState, FieldLabel, PrimaryButton, Screen, SecondaryButton } from "../components/ui";

export function WalletScreen() {
  const { api } = useAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<WalletLedgerItem[]>([]);
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, w] = await Promise.all([
        api.wallet.summary(),
        api.wallet.transactions(50, 0),
        api.wallet.withdrawalWallets(),
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
      >
        <Text style={styles.title}>Wallet</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Card>
          <Text style={styles.label}>Available</Text>
          <Text style={styles.balance}>
            {summary ? formatCurrency(summary.availableBalance) : "—"}
          </Text>
          {summary?.activePlan ? (
            <Text style={styles.plan}>
              Depositor plan · {summary.activePlan.riskPercent}% ·{" "}
              {summary.activePlan.dailyYieldPercent}% daily
            </Text>
          ) : null}
          <View style={styles.row}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Locked</Text>
              <Text style={styles.statValue}>
                {summary ? formatCurrency(summary.lockedBalance) : "—"}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Withdrawn</Text>
              <Text style={styles.statValue}>
                {summary ? formatCurrency(summary.totalWithdrawn) : "—"}
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Deposited</Text>
              <Text style={styles.statValue}>
                {summary ? formatCurrency(summary.totalDeposited) : "—"}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Earned</Text>
              <Text style={styles.statValue}>
                {summary ? formatCurrency(summary.totalEarned) : "—"}
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton label="Deposit" onPress={() => setDepositOpen(true)} color={colors.buy} />
          <SecondaryButton label="Withdraw" onPress={() => setWithdrawOpen(true)} />
        </View>

        <Text style={styles.section}>Transactions</Text>
        {txs.length === 0 && !loading ? (
          <EmptyState title="No transactions yet" />
        ) : (
          txs.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txDesc}>{tx.description}</Text>
                <Text style={styles.txDate}>{fmtDate(tx.createdAt)}</Text>
              </View>
              <Text style={[styles.txAmt, tx.amount >= 0 ? styles.pos : styles.neg]}>
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
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <FieldLabel>Risk % (depositor plan)</FieldLabel>
          <TextInput style={styles.input} value={risk} onChangeText={setRisk} keyboardType="decimal-pad" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {result ? <Text style={styles.result}>{result}</Text> : null}
          <PrimaryButton label={busy ? "…" : "Continue"} onPress={() => void submit()} disabled={busy} />
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
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<string | null>(wallets[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wallets[0]) setWalletId(wallets[0].id);
  }, [wallets]);

  async function submit() {
    const amt = Number(amount);
    if (!walletId) {
      setError("Add a verified withdrawal wallet on web first");
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
            <Text style={styles.muted}>No verified wallets — add one in Settings or on web.</Text>
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
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={busy ? "…" : "Withdraw"} onPress={() => void submit()} disabled={busy} />
          <SecondaryButton label="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
  label: { color: colors.muted, fontSize: 12, textTransform: "uppercase" },
  balance: { color: colors.text, fontSize: 32, fontWeight: "800", marginTop: 4 },
  plan: { color: colors.emerald, fontSize: 12, marginTop: 8 },
  row: { flexDirection: "row", gap: 16, marginTop: 16 },
  stat: { flex: 1 },
  statLabel: { color: colors.muted, fontSize: 11 },
  statValue: { color: colors.text, fontWeight: "600", marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginVertical: 16 },
  section: { color: colors.muted, fontSize: 12, textTransform: "uppercase", marginBottom: 8 },
  txRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  txDesc: { color: colors.text, fontSize: 14 },
  txDate: { color: colors.muted, fontSize: 11, marginTop: 2 },
  txAmt: { fontWeight: "700", fontSize: 14 },
  pos: { color: colors.buy },
  neg: { color: colors.sell },
  error: { color: colors.error, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
  },
  networkRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.divider },
  chipActive: { borderColor: colors.buy, backgroundColor: "rgba(74,158,255,0.1)" },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  result: { color: colors.emerald, fontSize: 12 },
  muted: { color: colors.muted, fontSize: 13 },
  walletRow: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.divider, marginBottom: 6 },
  walletActive: { borderColor: colors.buy },
  walletLabel: { color: colors.text, fontWeight: "600" },
  walletAddr: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
