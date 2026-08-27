import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../stores/theme";
import { SectionCard } from "../components/ui";
import { WEB_APP_URL } from "../config/env";

export function TermsScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.h1, { color: theme.text }]}>Terms & Conditions</Text>
      <Text style={{ color: theme.muted, marginBottom: 12, lineHeight: 20 }}>
        Effective for Trade Guard / TraderRank Pro ({WEB_APP_URL.replace(/^https?:\/\//, "")}).
        Full legal text also lives on the website.
      </Text>

      <SectionCard title="1. Account & access">
        <Text style={[styles.body, { color: theme.muted }]}>
          Registration payment (or an approved promo) is required for ACTIVE status.
          KYC is required for payouts only — not for signup or submitting setups.
          Banned or suspended accounts cannot withdraw or enroll in vault products.
        </Text>
      </SectionCard>

      <SectionCard title="2. Wallet withdrawals">
        <Text style={[styles.body, { color: theme.muted }]}>
          Prefer weekly withdrawals on Sundays (UTC) or monthly on the 1st (UTC),
          depending on platform settings. You can withdraw anytime. An{" "}
          <Text style={{ fontWeight: "700", color: theme.text }}>
            8% platform fee
          </Text>{" "}
          applies to every wallet withdrawal on gross, plus a processing fee ($3
          default; Investor VIP may waive processing only). Every withdrawal
          requires an email OTP before funds are requested.
        </Text>
      </SectionCard>

      <SectionCard title="3. On-chain vault contract">
        <Text style={[styles.body, { color: theme.muted }]}>
          Enroll on Chain: accept terms → document + liveness KYC → approval →
          deposit. Minimum $2,000 USDT. Indicative bands: 10% for $2,000–$5,000;
          15% above $5,000. Actual percentage may change with deposit size,
          available funds, market conditions, and past user behavior. Contract
          withdrawals deduct 15%. Once launched, a contract cannot be emptied —
          full withdrawal permanently closes it and you cannot apply again. The
          dashboard stays empty until approval; the contract launches after funded
          activation. You may cancel and restart enrollment before launch.
        </Text>
      </SectionCard>

      <SectionCard title="4. Investor & depositor programs">
        <Text style={[styles.body, { color: theme.muted }]}>
          Daily credits run at the platform yield window shown in your local
          country time. Illustrated yields are not a guarantee of profit. Pause,
          auto-stop, and VIP rules may apply as shown in the Invest hub.
        </Text>
      </SectionCard>

      <SectionCard title="5. Risk">
        <Text style={[styles.body, { color: theme.muted }]}>
          Trading and capital allocation involve substantial risk of loss. Virtual
          accounts, rankings, and illustrated yields do not guarantee profits.
          Cryptocurrency transfers are irreversible once broadcast.
        </Text>
      </SectionCard>

      <Pressable onPress={() => void Linking.openURL(`${WEB_APP_URL}/terms`)}>
        <Text style={{ color: theme.primary, fontWeight: "700", marginTop: 4 }}>
          Open full terms on the web →
        </Text>
      </Pressable>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  body: { fontSize: 14, lineHeight: 21 },
});
