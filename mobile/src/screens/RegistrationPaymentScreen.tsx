import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { Field, PrimaryButton, SectionCard } from "../components/ui";
import { formatUsdt, truncateMiddle } from "../lib/format";
import type { RegistrationCheckout } from "../lib/types";

export function RegistrationPaymentScreen() {
  const { api, refreshDashboard } = useAuth();
  const { theme } = useTheme();
  const [network, setNetwork] = useState("TRC20");
  const [promo, setPromo] = useState("");
  const [featured, setFeatured] = useState<{
    registrationFeeUsdt: number;
    promo: { code: string; finalAmount: number; discountPercent: number } | null;
  } | null>(null);
  const [checkout, setCheckout] = useState<RegistrationCheckout | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.payments
      .featuredPromo()
      .then(setFeatured)
      .catch(() => setFeatured(null));
    void api.payments
      .pendingRegistration(network)
      .then((r) => {
        if (r.pending) {
          setCheckout({
            paymentId: r.pending.paymentId,
            amount: r.pending.amount,
            currency: r.pending.currency,
            network: r.pending.network,
            payAddress: r.pending.payAddress,
            payAmount: r.pending.payAmount,
            payCurrency: r.pending.payCurrency,
            liveStatus: r.pending.liveStatus,
          });
        }
      })
      .catch(() => undefined);
  }, [api, network]);

  useEffect(() => {
    if (!checkout?.paymentId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await api.payments.getStatus(checkout.paymentId!);
        if (cancelled) return;
        setStatusLabel(st.confirmed ? "Confirmed" : st.progress || st.liveStatus || st.payment.status);
        if (st.confirmed) {
          await refreshDashboard();
          Alert.alert("Activated", "Registration payment confirmed.");
        }
      } catch {
        /* keep polling */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api, checkout?.paymentId, refreshDashboard]);

  async function payCrypto() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.payments.createRegistration(
        network,
        promo.trim() || undefined,
        "crypto",
      );
      if (res.success && !res.paymentId) {
        Alert.alert("Done", res.message || "Promo applied / activated");
        await refreshDashboard();
        return;
      }
      setCheckout(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function payFromWallet() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.payments.createRegistration(
        network,
        promo.trim() || undefined,
        "wallet",
      );
      Alert.alert("Wallet", res.message || "Charged from wallet balance");
      await refreshDashboard();
      setCheckout(res.paymentId ? res : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyPromoOnly() {
    if (!promo.trim()) return;
    setBusy(true);
    try {
      const res = await api.payments.applyPromo(promo.trim());
      Alert.alert("Promo", res.message);
      await refreshDashboard();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Promo failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <Text style={{ color: theme.muted, lineHeight: 20, marginBottom: 14 }}>
        ACTIVE status requires registration payment (crypto / MoMo / wallet) or a valid promo after
        email verification.
      </Text>

      <SectionCard title="Fee">
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 22 }}>
          {formatUsdt(featured?.registrationFeeUsdt ?? 0)}
        </Text>
        {featured?.promo ? (
          <Text style={{ color: theme.primary, marginTop: 8 }}>
            Featured {featured.promo.code}: {featured.promo.discountPercent}% off →{" "}
            {formatUsdt(featured.promo.finalAmount)}
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard title="Promo">
        <Field label="Promo code" value={promo} onChangeText={setPromo} autoCapitalize="characters" />
        <PrimaryButton label="Apply promo" onPress={() => void applyPromoOnly()} disabled={busy} variant="ghost" />
      </SectionCard>

      <SectionCard title="Network">
        <View style={{ gap: 8 }}>
          {["TRC20", "ERC20", "BEP20"].map((n) => (
            <PrimaryButton
              key={n}
              label={n}
              variant={network === n ? "primary" : "ghost"}
              onPress={() => setNetwork(n)}
            />
          ))}
        </View>
      </SectionCard>

      {error ? <Text style={{ color: theme.error, marginBottom: 12 }}>{error}</Text> : null}

      <PrimaryButton
        label={busy ? "…" : "Pay with crypto"}
        onPress={() => void payCrypto()}
        disabled={busy}
      />
      <View style={{ height: 10 }} />
      <PrimaryButton
        label={busy ? "…" : "Pay from wallet"}
        onPress={() => void payFromWallet()}
        disabled={busy}
        variant="ghost"
      />

      {checkout?.payAddress || checkout?.paymentId ? (
        <SectionCard title="Checkout">
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            {formatUsdt(checkout.payAmount ?? checkout.amount)} · {checkout.network}
          </Text>
          {checkout.payAddress ? (
            <>
              <Text style={{ color: theme.muted, marginVertical: 8 }}>
                {truncateMiddle(checkout.payAddress, 12, 10)}
              </Text>
              <PrimaryButton
                label="Copy address"
                variant="ghost"
                onPress={() => {
                  void Clipboard.setStringAsync(checkout.payAddress!).then(() =>
                    Alert.alert("Copied", "Address copied"),
                  );
                }}
              />
            </>
          ) : null}
          <Text style={{ color: theme.primary, marginTop: 12, fontWeight: "700" }}>
            Status · {statusLabel ?? checkout.liveStatus ?? "pending"}
          </Text>
        </SectionCard>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
});
