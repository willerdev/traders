import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../stores/theme";

export const INVESTOR_AUTO_STOP_THRESHOLD_USDT = 500;
export const INVESTOR_LOAN_ELIGIBILITY_USDT = 1000;
export const INVESTOR_AUTO_STOP_DATE_LABEL = "27 July 2026";
export const INVESTOR_VIP_YIELD_PERCENT = 10;

type Props = {
  investmentBalance: number;
  vipActive?: boolean;
  vipDailyYieldPercent?: number;
};

export function InvestorPolicyBanners({
  investmentBalance,
  vipActive = false,
  vipDailyYieldPercent = INVESTOR_VIP_YIELD_PERCENT,
}: Props) {
  const { theme } = useTheme();
  const balance = Number(investmentBalance);
  const hasBalance = Number.isFinite(balance) && balance > 0;
  const showVip = vipActive;
  const showAutoStop = hasBalance && balance < INVESTOR_AUTO_STOP_THRESHOLD_USDT;
  const showLoan = hasBalance && balance >= INVESTOR_LOAN_ELIGIBILITY_USDT;

  if (!showVip && !showAutoStop && !showLoan) return null;

  return (
    <View style={styles.wrap}>
      {showVip ? (
        <View
          style={[
            styles.banner,
            { backgroundColor: theme.primarySoft, borderColor: theme.primary },
          ]}
        >
          <Ionicons name="diamond" size={18} color={theme.primary} style={styles.icon} />
          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.text }]}>VIP privilege</Text>
            <Text style={[styles.copy, { color: theme.muted }]}>
              As a VIP investor you earn {vipDailyYieldPercent}% daily on your investment by
              default, plus weekend earnings and $0 withdrawal fees while VIP is active.
            </Text>
          </View>
        </View>
      ) : null}

      {showAutoStop ? (
        <View
          style={[
            styles.banner,
            { backgroundColor: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.45)" },
          ]}
        >
          <Ionicons name="warning" size={18} color="#F59E0B" style={styles.icon} />
          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.text }]}>Minimum investment update</Text>
            <Text style={[styles.copy, { color: theme.muted }]}>
              From {INVESTOR_AUTO_STOP_DATE_LABEL}, investments below $
              {INVESTOR_AUTO_STOP_THRESHOLD_USDT} will automatically stop. Yours is $
              {balance.toFixed(2)}. Top up to at least ${INVESTOR_AUTO_STOP_THRESHOLD_USDT} to keep
              earning.
            </Text>
          </View>
        </View>
      ) : null}

      {showLoan ? (
        <View
          style={[
            styles.banner,
            { backgroundColor: "rgba(56, 189, 248, 0.12)", borderColor: "rgba(56, 189, 248, 0.4)" },
          ]}
        >
          <Ionicons name="business" size={18} color="#38BDF8" style={styles.icon} />
          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.text }]}>Investment loan eligibility</Text>
            <Text style={[styles.copy, { color: theme.muted }]}>
              With ${INVESTOR_LOAN_ELIGIBILITY_USDT}+ invested, you can reinvest profit and borrow up
              to 80% of your investment while capital keeps earning. Message Support to apply.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 14 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  icon: { marginTop: 2 },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  copy: { fontSize: 12, lineHeight: 17 },
});
