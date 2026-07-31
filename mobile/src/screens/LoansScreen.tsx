import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import { PrimaryButton, ScreenState, SectionCard } from "../components/ui";
import { formatUsdt } from "../lib/format";

type Term = "DAILY" | "WEEKLY" | "MONTHLY";

type Quote = {
  term: Term;
  periodDays: number;
  dailyEarning: number;
  projectedEarnings: number;
  principal: number;
  interestAmount: number;
  totalDue: number;
  eligible: boolean;
  explanation: string;
  corpus: number;
};

type Loan = {
  id: string;
  term: Term;
  status: string;
  principal: number;
  totalDue: number;
  dueAt: string | null;
};

export function LoansScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [term, setTerm] = useState<Term>("WEEKLY");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [q, list] = await Promise.all([
        api.loans.quote(term),
        api.loans.list(),
      ]);
      setQuote(q);
      setLoans(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api, term]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ScreenState
        loading={loading && !quote}
        error={error && !quote ? error : null}
        onRetry={() => void load()}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={theme.primary}
            />
          }
        >
          <Text style={[styles.title, { color: theme.text }]}>Loans</Text>
          <Text style={{ color: theme.muted, marginBottom: 12, fontSize: 13 }}>
            80% advance on projected earnings · 20% interest · admin approval ·
            while open you may only withdraw the loan advance until repaid
          </Text>

          <View style={styles.terms}>
            {(["DAILY", "WEEKLY", "MONTHLY"] as Term[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTerm(t)}
                style={[
                  styles.termChip,
                  {
                    backgroundColor:
                      term === t ? theme.primary : theme.surfaceAlt,
                  },
                ]}
              >
                <Text
                  style={{
                    color: term === t ? "#fff" : theme.text,
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          {quote ? (
            <SectionCard title="Quote">
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                Daily est. {formatUsdt(quote.dailyEarning)} · Corpus{" "}
                {formatUsdt(quote.corpus)}
              </Text>
              <Text style={{ color: theme.text, marginTop: 8, fontWeight: "700" }}>
                Receive {formatUsdt(quote.principal)}
              </Text>
              <Text style={{ color: theme.muted, marginTop: 4, fontSize: 12 }}>
                Interest {formatUsdt(quote.interestAmount)} · Repay{" "}
                {formatUsdt(quote.totalDue)}
              </Text>
              <Text style={{ color: theme.muted, marginTop: 8, fontSize: 11 }}>
                {quote.explanation}
              </Text>
              <View style={{ height: 10 }} />
              <PrimaryButton
                label={busy ? "Submitting…" : `Request ${term.toLowerCase()} loan`}
                loading={busy}
                disabled={!quote.eligible || busy}
                onPress={() => {
                  setBusy(true);
                  void api.loans
                    .request(term)
                    .then(() => {
                      Alert.alert(
                        "Submitted",
                        "Check your email. Admin will approve shortly.",
                      );
                      return load();
                    })
                    .catch((err) =>
                      Alert.alert(
                        "Error",
                        err instanceof Error ? err.message : "Failed",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Your loans">
            {loans.length === 0 ? (
              <Text style={{ color: theme.muted, fontSize: 13 }}>None yet</Text>
            ) : (
              loans.map((loan) => (
                <View key={loan.id} style={{ marginBottom: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    {loan.term} · {loan.status}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {formatUsdt(loan.principal)} advance · repay{" "}
                    {formatUsdt(loan.totalDue)}
                  </Text>
                  {loan.status === "PENDING" ? (
                    <PrimaryButton
                      label="Cancel"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setBusy(true);
                        void api.loans
                          .cancel(loan.id)
                          .then(() => load())
                          .catch((err) =>
                            Alert.alert(
                              "Error",
                              err instanceof Error ? err.message : "Failed",
                            ),
                          )
                          .finally(() => setBusy(false));
                      }}
                    />
                  ) : null}
                  {loan.status === "APPROVED" ? (
                    <PrimaryButton
                      label={`Repay ${formatUsdt(loan.totalDue)}`}
                      size="sm"
                      onPress={() => {
                        setBusy(true);
                        void api.loans
                          .repay(loan.id)
                          .then(() => {
                            Alert.alert("Repaid", "Confirmation emailed.");
                            return load();
                          })
                          .catch((err) =>
                            Alert.alert(
                              "Error",
                              err instanceof Error ? err.message : "Failed",
                            ),
                          )
                          .finally(() => setBusy(false));
                      }}
                    />
                  ) : null}
                </View>
              ))
            )}
          </SectionCard>

          {error ? (
            <Text style={{ color: theme.danger }}>{error}</Text>
          ) : null}
        </ScrollView>
      </ScreenState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  terms: { flexDirection: "row", gap: 8 },
  termChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
