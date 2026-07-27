import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../stores/theme";
import { SectionCard } from "../components/ui";

export function TermsScreen() {
  const { theme } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.h1, { color: theme.text }]}>Terms & Conditions</Text>
      <Text style={{ color: theme.muted, marginBottom: 12 }}>
        Effective for Trade Guard / TraderRank Pro (thetradeguard.com).
      </Text>

      <SectionCard title="Preferred withdrawals">
        <Text style={[styles.body, { color: theme.muted }]}>
          Prefer weekly (Sundays UTC) or monthly (1st UTC) withdrawals. Anytime
          withdrawals still work but may include an off-schedule penalty (default
          8% of gross) plus processing fee. VIP may waive processing fee, not the
          off-schedule penalty unless stated.
        </Text>
      </SectionCard>

      <SectionCard title="On-chain vault contract">
        <Text style={[styles.body, { color: theme.muted }]}>
          Enroll on Chain: accept terms → document + liveness KYC → approval →
          deposit. Minimum $2,000 USDT. Indicative bands: 10% for $2,000–$5,000;
          15% above $5,000. Actual percentage may change with deposit size,
          available funds, market conditions, and past user behavior. Withdrawals
          deduct 5%. Dashboard stays empty until approval; contract launches after
          funded activation.
        </Text>
      </SectionCard>

      <SectionCard title="Risk">
        <Text style={[styles.body, { color: theme.muted }]}>
          Trading and capital allocation involve substantial risk of loss. Virtual
          accounts and illustrated yields do not guarantee profits.
        </Text>
      </SectionCard>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  body: { fontSize: 14, lineHeight: 21 },
});
