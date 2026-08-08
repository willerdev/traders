import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../stores/auth";
import { useTheme } from "../stores/theme";
import {
  Field,
  PrimaryButton,
  ScreenState,
  SectionCard,
} from "../components/ui";
import { LivenessScanner } from "../components/LivenessScanner";
import { formatUsdt } from "../lib/format";
import { WEB_APP_URL } from "../config/env";
import type { ChainContractEnrollment } from "../lib/types";
import type { LocalUploadFile } from "../lib/api";

const COUNTRIES = [
  "Rwanda",
  "Uganda",
  "Kenya",
  "Tanzania",
  "Burundi",
  "Nigeria",
  "Ghana",
  "South Africa",
  "United States",
  "United Kingdom",
  "Other",
];

type DocType = "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE";

function fileFromUri(uri: string, name: string): LocalUploadFile {
  const lower = uri.toLowerCase();
  const type = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return { uri, name, type };
}

export function ChainEnrollScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [enrollment, setEnrollment] = useState<ChainContractEnrollment | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [kycStep, setKycStep] = useState<"docs" | "liveness">("docs");
  const [country, setCountry] = useState("Rwanda");
  const [customCountry, setCustomCountry] = useState("");
  const [documentType, setDocumentType] = useState<DocType>("NATIONAL_ID");
  const [documentNumber, setDocumentNumber] = useState("");
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [frontUrl, setFrontUrl] = useState("");
  const [backUrl, setBackUrl] = useState("");
  const [deposit, setDeposit] = useState("2000");

  const load = useCallback(async () => {
    setError(null);
    try {
      setEnrollment(await api.chainEnrollment.get());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load enrollment",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const t = enrollment?.terms;
  const resolvedCountry =
    country === "Other" ? customCountry.trim() : country.trim();
  const needsBack = documentType !== "PASSPORT";

  async function pickDoc(side: "front" | "back") {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]?.uri) return;
    const uri = res.assets[0].uri;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.uploads.kyc(
        fileFromUri(uri, `${side}-${Date.now()}.jpg`),
      );
      if (side === "front") {
        setFrontUri(uri);
        setFrontUrl(uploaded.url);
      } else {
        setBackUri(uri);
        setBackUrl(uploaded.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function acceptTerms() {
    setBusy(true);
    setError(null);
    try {
      setEnrollment(await api.chainEnrollment.acceptTerms());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept terms");
    } finally {
      setBusy(false);
    }
  }

  async function goLiveness() {
    if (!resolvedCountry || !documentNumber.trim() || !frontUrl) {
      setError("Complete country, document number, and front image");
      return;
    }
    if (needsBack && !backUrl) {
      setError("Upload the back of your ID");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.chainEnrollment.validateDocument({
        country: resolvedCountry,
        documentType,
        documentNumber: documentNumber.trim(),
      });
      setKycStep("liveness");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid document number");
    } finally {
      setBusy(false);
    }
  }

  async function onLivenessDone(uri: string) {
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.uploads.kyc(
        fileFromUri(uri, `liveness-${Date.now()}.jpg`),
      );
      const next = await api.chainEnrollment.submitKyc({
        country: resolvedCountry,
        documentType,
        documentNumber: documentNumber.trim(),
        documentFrontUrl: frontUrl,
        documentBackUrl: needsBack ? backUrl : undefined,
        livenessSelfieUrl: uploaded.url,
      });
      setEnrollment(next);
      setKycStep("docs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setKycStep("docs");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    const amount = Number(deposit);
    setBusy(true);
    setError(null);
    try {
      setEnrollment(await api.chainEnrollment.activate(amount));
      Alert.alert(
        "Launched",
        "Contract activated. You can deposit on web Chain dashboard for on-chain settlement.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRestart() {
    Alert.alert(
      "Cancel & restart?",
      "This clears terms and KYC for chain enrollment.",
      [
        { text: "Keep going", style: "cancel" },
        {
          text: "Restart",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const next = await api.chainEnrollment.cancel();
                setEnrollment(next);
                setAgreed(false);
                setKycStep("docs");
              } catch (err) {
                Alert.alert(
                  "Error",
                  err instanceof Error ? err.message : "Cancel failed",
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  if (loading && !enrollment) {
    return (
      <ScreenState loading>
        <View />
      </ScreenState>
    );
  }
  if (!enrollment || !t) {
    return (
      <ScreenState error={error || "Unavailable"} onRetry={() => void load()}>
        <View />
      </ScreenState>
    );
  }

  const phase =
    enrollment.status === "NOT_STARTED"
      ? 1
      : enrollment.status === "TERMS_ACCEPTED" ||
          enrollment.status === "KYC_REJECTED"
        ? 2
        : 3;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.phaseRow}>
        {["Terms", "Verify", "Dashboard"].map((label, i) => {
          const n = i + 1;
          const active = phase === n;
          const done = phase > n;
          return (
            <View
              key={label}
              style={[
                styles.pill,
                {
                  borderColor: active
                    ? theme.primary
                    : done
                      ? "#34D39966"
                      : theme.divider,
                  backgroundColor: active
                    ? theme.primarySoft
                    : done
                      ? "#34D39922"
                      : theme.surface,
                },
              ]}
            >
              <Text
                style={{
                  color: active
                    ? theme.primary
                    : done
                      ? "#34D399"
                      : theme.muted,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {n}. {label}
              </Text>
            </View>
          );
        })}
      </View>

      {enrollment.status !== "NOT_STARTED" ? (
        <PrimaryButton
          label={busy ? "…" : "Cancel & restart"}
          variant="secondary"
          size="sm"
          onPress={() => void cancelRestart()}
          disabled={busy}
        />
      ) : null}

      {error ? (
        <Text style={{ color: theme.error, marginVertical: 8 }}>{error}</Text>
      ) : null}

      {phase === 1 ? (
        <View style={{ gap: 12 }}>
          <Text style={[styles.h1, { color: theme.text }]}>On-chain vault</Text>
          <Text style={{ color: theme.muted, lineHeight: 20 }}>
            Agree → verify ID & liveness → approval → deposit. Dashboard stays
            empty until you are approved and fund the vault.
          </Text>
          <SectionCard title="Indicative yield bands">
            <Text style={{ color: theme.text, lineHeight: 20 }}>
              ${t.minDepositUsd.toLocaleString()}–$
              {t.midTierMaxUsd.toLocaleString()}: {t.midTierYieldPercent}%{"\n"}
              Above ${t.midTierMaxUsd.toLocaleString()}:{" "}
              {t.highTierYieldPercent}%{"\n"}Withdraw fee:{" "}
              {t.withdrawFeePercent}%
            </Text>
            <Text
              style={{
                color: theme.muted,
                marginTop: 10,
                lineHeight: 18,
                fontSize: 13,
              }}
            >
              {t.yieldDisclaimer ||
                "Percentages are indicative and may change with deposit size, available funds, market conditions, and past user behavior."}
            </Text>
          </SectionCard>
          <Pressable
            onPress={() => setAgreed((v) => !v)}
            style={styles.checkRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: theme.divider,
                  backgroundColor: agreed ? theme.primary : "transparent",
                },
              ]}
            />
            <Text style={{ color: theme.text, flex: 1, lineHeight: 18 }}>
              I agree to vault terms, indicative yield bands,{" "}
              {t.withdrawFeePercent}% withdrawal fee, and platform Terms.
            </Text>
          </Pressable>
          <PrimaryButton
            label={busy ? "…" : "Agree & continue"}
            onPress={() => void acceptTerms()}
            disabled={!agreed || busy}
          />
        </View>
      ) : null}

      {phase === 2 ? (
        <View style={{ gap: 12 }}>
          <Text style={[styles.h1, { color: theme.text }]}>
            Identity verification
          </Text>
          {enrollment.status === "KYC_REJECTED" &&
          enrollment.rejectionReason ? (
            <Text style={{ color: theme.error }}>
              Rejected: {enrollment.rejectionReason}
            </Text>
          ) : null}

          {kycStep === "docs" ? (
            <>
              <SectionCard title="Country">
                <View style={{ gap: 8 }}>
                  {COUNTRIES.map((c) => (
                    <PrimaryButton
                      key={c}
                      label={c}
                      size="sm"
                      variant={country === c ? "primary" : "ghost"}
                      onPress={() => setCountry(c)}
                    />
                  ))}
                  {country === "Other" ? (
                    <Field
                      label="Country name"
                      value={customCountry}
                      onChangeText={setCustomCountry}
                    />
                  ) : null}
                </View>
              </SectionCard>
              <SectionCard title="Document">
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {(
                    [
                      ["NATIONAL_ID", "National ID"],
                      ["PASSPORT", "Passport"],
                      ["DRIVERS_LICENSE", "License"],
                    ] as const
                  ).map(([v, label]) => (
                    <PrimaryButton
                      key={v}
                      label={label}
                      size="sm"
                      variant={documentType === v ? "primary" : "ghost"}
                      onPress={() => {
                        setDocumentType(v);
                        if (v === "PASSPORT") {
                          setBackUri(null);
                          setBackUrl("");
                        }
                      }}
                    />
                  ))}
                </View>
                <Field
                  label="Document number"
                  value={documentNumber}
                  onChangeText={setDocumentNumber}
                  autoCapitalize="characters"
                />
                <Text
                  style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}
                >
                  {documentType === "PASSPORT"
                    ? "Upload passport data page only. Keep corners visible, no glare."
                    : "Upload front and back. Full card visible, readable name/photo."}
                </Text>
                <PrimaryButton
                  label={frontUrl ? "Replace front image" : "Upload front"}
                  variant="secondary"
                  onPress={() => void pickDoc("front")}
                  disabled={busy}
                />
                {frontUri ? (
                  <Image source={{ uri: frontUri }} style={styles.preview} />
                ) : null}
                {needsBack ? (
                  <>
                    <PrimaryButton
                      label={backUrl ? "Replace back image" : "Upload back"}
                      variant="secondary"
                      onPress={() => void pickDoc("back")}
                      disabled={busy}
                    />
                    {backUri ? (
                      <Image source={{ uri: backUri }} style={styles.preview} />
                    ) : null}
                  </>
                ) : null}
              </SectionCard>
              <PrimaryButton
                label={busy ? "Checking…" : "Continue to liveness"}
                onPress={() => void goLiveness()}
                disabled={busy}
              />
            </>
          ) : (
            <SectionCard title="Liveness">
              {busy ? (
                <Text style={{ color: theme.muted }}>Submitting…</Text>
              ) : (
                <LivenessScanner
                  onComplete={(uri) => void onLivenessDone(uri)}
                  onCancel={() => setKycStep("docs")}
                />
              )}
            </SectionCard>
          )}
        </View>
      ) : null}

      {phase === 3 ? (
        <View style={{ gap: 12 }}>
          <Text style={[styles.h1, { color: theme.text }]}>
            {enrollment.status === "KYC_PENDING"
              ? "Under review"
              : enrollment.status === "APPROVED"
                ? "Approved — fund blockchain wallet"
                : enrollment.status === "ACTIVE"
                  ? "Blockchain wallet active"
                  : "Dashboard"}
          </Text>
          <Text style={{ color: theme.muted, lineHeight: 20 }}>
            {enrollment.status === "KYC_PENDING"
              ? "Balances stay empty until approval."
              : enrollment.status === "APPROVED"
                ? `Transfer at least ${formatUsdt(t.minDepositUsd)} from your platform wallet. Principal and profits lock for five days.`
                : enrollment.status === "ACTIVE"
                  ? `Daily rate ${enrollment.yieldPercent ?? "—"}%. Principal and profits share a five-day lock.`
                  : ""}
          </Text>
          <View style={styles.nullGrid}>
            {["Vault balance", "Yield rate", "Rewards", "Withdrawals"].map(
              (label) => (
                <View
                  key={label}
                  style={[
                    styles.nullCard,
                    {
                      borderColor: theme.divider,
                      backgroundColor: theme.surface,
                    },
                  ]}
                >
                  <Text style={{ color: theme.muted, fontSize: 11 }}>
                    {label}
                  </Text>
                  <Text
                    style={{
                      color: theme.muted,
                      fontSize: 22,
                      fontWeight: "700",
                    }}
                  >
                    {enrollment.status === "ACTIVE" && label === "Yield rate"
                      ? `${enrollment.yieldPercent ?? "—"}%`
                      : enrollment.status === "ACTIVE" &&
                          label === "Withdrawals"
                        ? `${enrollment.withdrawFeePercent}%`
                        : "—"}
                  </Text>
                </View>
              ),
            )}
          </View>
          {enrollment.status === "ACTIVE" ? (
            <SectionCard title="Blockchain wallet">
              <Text
                style={{
                  color: theme.muted,
                  fontSize: 13,
                  lineHeight: 19,
                  marginBottom: 10,
                }}
              >
                View balances, profit history, lock time, transfers, and
                withdrawals in the web blockchain wallet.
              </Text>
              <PrimaryButton
                label="Open blockchain wallet on web"
                onPress={() =>
                  void Linking.openURL(`${WEB_APP_URL}/blockchain`)
                }
                size="sm"
              />
            </SectionCard>
          ) : null}
          {enrollment.status === "APPROVED" ? (
            <SectionCard title="Transfer from platform wallet">
              <Field
                label="Amount (USDT)"
                value={deposit}
                onChangeText={setDeposit}
                keyboardType="numeric"
              />
              <Text
                style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}
              >
                Five-day principal + profit lock · indicative{" "}
                {t.midTierYieldPercent}% / {t.highTierYieldPercent}% daily ·{" "}
                {t.withdrawFeePercent}% withdrawal fee
              </Text>
              <PrimaryButton
                label={
                  busy ? "…" : `Transfer · ${formatUsdt(Number(deposit) || 0)}`
                }
                onPress={() => void activate()}
                disabled={busy || Number(deposit) < t.minDepositUsd}
              />
            </SectionCard>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  phaseRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  h1: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  preview: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: "#111",
  },
  nullGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nullCard: {
    width: "47%",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 12,
  },
});
