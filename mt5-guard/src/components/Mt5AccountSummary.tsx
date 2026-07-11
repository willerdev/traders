import { StyleSheet, Text, View } from "react-native";
import type { UserMt5AccountSource, UserMt5AccountSummary } from "../lib/types";
import { fmtPrice } from "../lib/format";
import { useTheme } from "../stores/theme";
import { Card } from "./ui";

type Props = {
  account: UserMt5AccountSummary;
  accountSource?: UserMt5AccountSource;
};

export function Mt5AccountSummary({ account, accountSource }: Props) {
  const { theme } = useTheme();
  const balance =
    accountSource && accountSource !== "virtual"
      ? account.startingBalance
      : account.startingBalance + account.realizedProfit;

  return (
    <Card>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted }]}>Balance</Text>
        <Text style={[styles.value, { color: theme.text }]}>{fmtPrice(balance)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted }]}>Equity</Text>
        <Text style={[styles.value, { color: theme.text }]}>{fmtPrice(account.equity)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted }]}>Floating</Text>
        <Text
          style={[
            styles.value,
            { color: account.floatingProfit >= 0 ? theme.buy : theme.sell },
          ]}
        >
          {fmtPrice(account.floatingProfit)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600" },
  value: { fontWeight: "700", fontSize: 15 },
});
