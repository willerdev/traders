import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../stores/auth";
import { computeOneToOneTakeProfit } from "../lib/mt5-order-stops";
import { fmtPrice } from "../lib/format";
import { useTheme } from "../stores/theme";
import type { Mt5MarketOrderPreview } from "../lib/types";
import { PrimaryButton, SecondaryButton } from "./ui";

type Props = {
  visible: boolean;
  symbol: string;
  direction: "BUY" | "SELL";
  onClose: () => void;
  onPlaced: () => void;
};

export function PlaceOrderModal({
  visible,
  symbol,
  direction,
  onClose,
  onPlaced,
}: Props) {
  const { api } = useAuth();
  const { theme } = useTheme();
  const styles = useModalStyles();
  const [preview, setPreview] = useState<Mt5MarketOrderPreview | null>(null);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [tpManual, setTpManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    void api.signals
      .mt5OrderPreview(symbol, direction)
      .then((data) => {
        setPreview(data);
        setStopLoss(String(data.stopLoss));
        setTakeProfit(String(data.takeProfit));
        setTpManual(false);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Preview failed"),
      )
      .finally(() => setLoading(false));
  }, [visible, symbol, direction, api]);

  function onSlChange(value: string) {
    setStopLoss(value);
    if (tpManual || !preview) return;
    const sl = Number(value);
    if (!Number.isFinite(sl)) return;
    const tp = computeOneToOneTakeProfit(direction, preview.entry, sl);
    setTakeProfit(String(Number(tp.toFixed(5))));
  }

  async function submit() {
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    if (!Number.isFinite(sl) || !Number.isFinite(tp)) {
      setError("Enter valid SL and TP");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.signals.placeMt5Order({
        symbol,
        direction,
        stopLoss: sl,
        takeProfit: tp,
      });
      onPlaced();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  const accent = direction === "BUY" ? theme.buy : theme.sell;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {direction} {symbol}
          </Text>
          <Text style={styles.sub}>
            Market · SL/TP default 1:1 RR
          </Text>

          {loading ? (
            <Text style={styles.muted}>Loading quote…</Text>
          ) : preview ? (
            <>
              <View style={styles.row}>
                <Text style={styles.muted}>Entry</Text>
                <Text style={styles.value}>{fmtPrice(preview.entry)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.muted}>Volume</Text>
                <Text style={styles.value}>{preview.risk.volume} lot</Text>
              </View>
              <Text style={styles.label}>
                Stop loss (default {preview.defaultSlPips} pips)
              </Text>
              <TextInput
                style={styles.input}
                value={stopLoss}
                onChangeText={onSlChange}
                keyboardType="decimal-pad"
              />
              <Text style={styles.label}>Take profit (1:1)</Text>
              <TextInput
                style={styles.input}
                value={takeProfit}
                onChangeText={(v) => {
                  setTpManual(true);
                  setTakeProfit(v);
                }}
                keyboardType="decimal-pad"
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <SecondaryButton label="Cancel" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={submitting ? "Placing…" : `Place ${direction}`}
                onPress={() => void submit()}
                disabled={submitting || loading || !preview}
                color={accent}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function useModalStyles() {
  const { theme } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: theme.overlay,
          justifyContent: "flex-end",
        },
        sheet: {
          backgroundColor: theme.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 24,
          gap: 10,
          borderTopWidth: 1,
          borderColor: theme.divider,
        },
        title: { color: theme.text, fontSize: 20, fontWeight: "800" },
        sub: { color: theme.muted, fontSize: 12, marginBottom: 8 },
        row: { flexDirection: "row", justifyContent: "space-between" },
        muted: { color: theme.muted, fontSize: 13 },
        value: { color: theme.text, fontWeight: "700" },
        label: { color: theme.muted, fontSize: 12, marginTop: 4 },
        input: {
          backgroundColor: theme.inputBg,
          borderWidth: 1,
          borderColor: theme.divider,
          borderRadius: 12,
          padding: 14,
          color: theme.text,
          fontSize: 16,
        },
        error: { color: theme.error, fontSize: 12 },
        actions: { flexDirection: "row", gap: 10, marginTop: 8, alignItems: "stretch" },
      }),
    [theme],
  );
}
