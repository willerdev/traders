import { useCallback, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../stores/auth";
import { useTheme } from "../../stores/theme";
import { Field, PrimaryButton, ScreenState, SectionCard } from "../../components/ui";
import type { KycRecord, SubmitKycInput } from "../../lib/types";

type DocType = SubmitKycInput["documentType"];

export function KycScreen() {
  const { api } = useAuth();
  const { theme } = useTheme();
  const [kyc, setKyc] = useState<KycRecord | null>(null);
  const [documentType, setDocumentType] = useState<DocType>("NATIONAL_ID");
  const [documentNumber, setDocumentNumber] = useState("");
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.users.getKyc();
      setKyc(data);
      if (data.documentNumber) setDocumentNumber(data.documentNumber);
      if (data.documentType) setDocumentType(data.documentType);
      setFrontUrl(data.documentFrontUrl ?? null);
      setBackUrl(data.documentBackUrl ?? null);
      setSelfieUrl(data.selfieUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load KYC");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pickAndUpload(setter: (url: string) => void) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload KYC images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const uploaded = await api.uploads.kyc({
        uri: asset.uri,
        name: asset.fileName ?? `kyc-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      });
      setter(uploaded.url);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!documentNumber.trim() || !frontUrl || !selfieUrl) {
      Alert.alert("Missing fields", "Document number, front image, and selfie are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.users.submitKyc({
        documentType,
        documentNumber: documentNumber.trim(),
        documentFrontUrl: frontUrl,
        documentBackUrl: backUrl ?? undefined,
        selfieUrl,
      });
      setKyc(res);
      Alert.alert("Submitted", `KYC status: ${res.status}`);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    try {
      const res = await api.users.retryKyc();
      setKyc(res);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenState loading={loading} error={error} onRetry={() => void load()}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={{ color: theme.muted, marginBottom: 12, lineHeight: 20 }}>
            KYC is required for payouts only — not for registration or browsing the app.
          </Text>
          <SectionCard title="Current status">
            <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 16 }}>
              {kyc?.status ?? "NOT_STARTED"}
            </Text>
            {kyc?.status === "REJECTED" ? (
              <>
                <Text style={{ color: theme.error, marginVertical: 8 }}>{kyc.rejectionReason}</Text>
                <PrimaryButton label="Retry KYC" onPress={() => void retry()} disabled={busy} />
              </>
            ) : null}
          </SectionCard>

          {kyc?.status !== "APPROVED" && kyc?.status !== "PENDING" ? (
            <>
              <SectionCard title="Document">
                <View style={{ gap: 8, marginBottom: 12 }}>
                  {(["PASSPORT", "NATIONAL_ID", "DRIVERS_LICENSE"] as DocType[]).map((t) => (
                    <PrimaryButton
                      key={t}
                      label={t.replace("_", " ")}
                      variant={documentType === t ? "primary" : "ghost"}
                      onPress={() => setDocumentType(t)}
                    />
                  ))}
                </View>
                <Field label="Document number" value={documentNumber} onChangeText={setDocumentNumber} />
              </SectionCard>

              <SectionCard title="Images">
                <UploadSlot
                  label="Front"
                  url={frontUrl}
                  onPick={() => void pickAndUpload(setFrontUrl)}
                />
                <UploadSlot
                  label="Back (optional)"
                  url={backUrl}
                  onPick={() => void pickAndUpload(setBackUrl)}
                />
                <UploadSlot
                  label="Selfie"
                  url={selfieUrl}
                  onPick={() => void pickAndUpload(setSelfieUrl)}
                />
              </SectionCard>

              <PrimaryButton
                label={busy ? "Working…" : "Submit KYC"}
                onPress={() => void submit()}
                disabled={busy}
              />
            </>
          ) : null}
        </ScrollView>
      </ScreenState>
    </View>
  );
}

function UploadSlot({
  label,
  url,
  onPick,
}: {
  label: string;
  url: string | null;
  onPick: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: theme.muted, marginBottom: 8, fontWeight: "600" }}>{label}</Text>
      {url ? (
        <Image source={{ uri: url }} style={styles.preview} resizeMode="cover" />
      ) : null}
      <PrimaryButton label={url ? "Replace" : "Upload"} onPress={onPick} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  preview: { width: "100%", height: 140, borderRadius: 12, marginBottom: 8 },
});
