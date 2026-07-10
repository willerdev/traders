import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { useAuth } from "../stores/auth";
import { WEB_APP_URL } from "../config/env";
import { colors } from "../theme/colors";
import type { MetaApiAccountRow, Mt5SyncStatus, SavedWithdrawalWallet, UserSettings } from "../lib/types";
import { Card, FieldLabel, PrimaryButton, Screen, SecondaryButton } from "../components/ui";
import { canAccessMt5Copy } from "../lib/copy-access";
import { WithdrawalWalletsSection } from "../components/WithdrawalWalletsSection";

export function SettingsScreen() {
  const { api, user, dashboard, logout } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sync, setSync] = useState<Mt5SyncStatus | null>(null);
  const [accounts, setAccounts] = useState<MetaApiAccountRow[]>([]);
  const [wallets, setWallets] = useState<SavedWithdrawalWallet[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"TRC20" | "MOBILE_MONEY">("TRC20");
  const [trc20Address, setTrc20Address] = useState("");
  const [mobileProvider, setMobileProvider] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [claimName, setClaimName] = useState("");
  const [claimLogin, setClaimLogin] = useState("");
  const [claimPassword, setClaimPassword] = useState("");
  const [claimServer, setClaimServer] = useState("");
  const [loading, setLoading] = useState(true);

  const canCopy = canAccessMt5Copy({
    role: user?.role,
    adminPermissions: dashboard?.user.adminPermissions,
  });

  const applySettings = useCallback((s: UserSettings) => {
    setSettings(s);
    setDisplayName(s.user.displayName);
    setPhone(s.profile?.phone ?? "");
    setDob(s.profile?.dateOfBirth ?? "");
    setCountry(s.profile?.country ?? "");
    setCity(s.profile?.city ?? "");
    setAddressLine1(s.profile?.addressLine1 ?? "");
    setPostalCode(s.profile?.postalCode ?? "");
    const method = s.profile?.payoutMethod === "MOBILE_MONEY" ? "MOBILE_MONEY" : "TRC20";
    setPayoutMethod(method);
    setTrc20Address(s.profile?.trc20Address ?? "");
    setMobileProvider(s.profile?.mobileMoneyProvider ?? "");
    setMobileNumber(s.profile?.mobileMoneyNumber ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st, acc, w] = await Promise.all([
        api.users.settings(),
        api.mt5Sync.status(),
        api.signals.metaApiAccounts().catch(() => ({ items: [] as MetaApiAccountRow[] })),
        api.wallet.withdrawalWallets().catch(() => ({ items: [] as SavedWithdrawalWallet[] })),
      ]);
      applySettings(s);
      setSync(st);
      setAccounts(acc.items ?? []);
      setWallets(w.items ?? []);
    } catch (err) {
      Alert.alert("Settings", err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [api, applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    try {
      const updated = await api.users.updateProfile({
        displayName,
        phone,
        dateOfBirth: dob || undefined,
      });
      applySettings(updated);
      Alert.alert("Saved", "Profile updated");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    }
  }

  async function saveAddress() {
    try {
      const updated = await api.users.updateAddress({
        country,
        city,
        addressLine1,
        postalCode,
      });
      applySettings(updated);
      Alert.alert("Saved", "Address updated");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    }
  }

  async function savePayout() {
    try {
      const body =
        payoutMethod === "TRC20"
          ? { payoutMethod: "TRC20", trc20Address }
          : {
              payoutMethod: "MOBILE_MONEY",
              mobileMoneyProvider: mobileProvider,
              mobileMoneyNumber: mobileNumber,
            };
      const updated = await api.users.updatePaymentDetails(body);
      applySettings(updated);
      Alert.alert("Saved", "Payout details updated");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    }
  }

  async function toggleSync(value: boolean) {
    try {
      const next = await api.mt5Sync.setEnabled(value);
      setSync(next);
    } catch (err) {
      Alert.alert("Sync", err instanceof Error ? err.message : "Failed");
    }
  }

  async function selectAccount(id: string) {
    try {
      const updated = await api.users.updateTradingAccount(id);
      applySettings(updated);
      Alert.alert("Linked", "Trading account updated");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    }
  }

  async function claimAccount() {
    if (!claimName || !claimLogin || !claimPassword || !claimServer) {
      Alert.alert("Claim account", "Fill in all MT5 fields");
      return;
    }
    try {
      await api.users.claimTradingAccount({
        accountName: claimName,
        login: claimLogin,
        password: claimPassword,
        server: claimServer,
      });
      setClaimName("");
      setClaimLogin("");
      setClaimPassword("");
      setClaimServer("");
      await load();
      Alert.alert("Submitted", "Account claim submitted — check status on web");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Claim failed");
    }
  }

  function openWeb(path: string) {
    void Linking.openURL(`${WEB_APP_URL}${path}`);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />
        }
      >
        <Text style={styles.title}>Settings</Text>

        <Card>
          <Text style={styles.section}>Profile</Text>
          <FieldLabel>Display name</FieldLabel>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />
          <FieldLabel>Phone</FieldLabel>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FieldLabel>Date of birth</FieldLabel>
          <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
          <PrimaryButton label="Save profile" onPress={() => void saveProfile()} />
        </Card>

        <Card>
          <Text style={styles.section}>Address</Text>
          <FieldLabel>Country</FieldLabel>
          <TextInput style={styles.input} value={country} onChangeText={setCountry} />
          <FieldLabel>City</FieldLabel>
          <TextInput style={styles.input} value={city} onChangeText={setCity} />
          <FieldLabel>Address</FieldLabel>
          <TextInput style={styles.input} value={addressLine1} onChangeText={setAddressLine1} />
          <FieldLabel>Postal code</FieldLabel>
          <TextInput style={styles.input} value={postalCode} onChangeText={setPostalCode} />
          <PrimaryButton label="Save address" onPress={() => void saveAddress()} />
        </Card>

        <Card>
          <Text style={styles.section}>Payout</Text>
          <View style={styles.methodRow}>
            {(["TRC20", "MOBILE_MONEY"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setPayoutMethod(m)}
                style={[styles.chip, payoutMethod === m && styles.chipActive]}
              >
                <Text style={styles.chipText}>{m === "TRC20" ? "TRC20" : "Mobile Money"}</Text>
              </Pressable>
            ))}
          </View>
          {payoutMethod === "TRC20" ? (
            <>
              <FieldLabel>TRC20 address</FieldLabel>
              <TextInput style={styles.input} value={trc20Address} onChangeText={setTrc20Address} autoCapitalize="none" />
            </>
          ) : (
            <>
              <FieldLabel>Provider</FieldLabel>
              <TextInput style={styles.input} value={mobileProvider} onChangeText={setMobileProvider} />
              <FieldLabel>Number</FieldLabel>
              <TextInput style={styles.input} value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" />
            </>
          )}
          <PrimaryButton label="Save payout" onPress={() => void savePayout()} />
        </Card>

        <Card>
          <Text style={styles.section}>Withdrawal wallets</Text>
          <WithdrawalWalletsSection wallets={wallets} onChanged={() => void load()} />
        </Card>

        <Card>
          <Text style={styles.section}>Linked MT5 account</Text>
          <Text style={styles.muted}>
            Current: {settings?.user.metaApiAccountId ?? "None"}
          </Text>
          {accounts.slice(0, 8).map((a) => (
            <Pressable key={a.id} style={styles.accountRow} onPress={() => void selectAccount(a.id)}>
              <Text style={styles.accountName}>{a.name}</Text>
              <Text style={styles.muted}>{a.login ? String(a.login) : a.id.slice(0, 8)}</Text>
            </Pressable>
          ))}
          <Text style={[styles.section, { marginTop: 12 }]}>Claim new account</Text>
          <FieldLabel>Account name</FieldLabel>
          <TextInput style={styles.input} value={claimName} onChangeText={setClaimName} />
          <FieldLabel>Login</FieldLabel>
          <TextInput style={styles.input} value={claimLogin} onChangeText={setClaimLogin} keyboardType="number-pad" />
          <FieldLabel>Password</FieldLabel>
          <TextInput style={styles.input} value={claimPassword} onChangeText={setClaimPassword} secureTextEntry />
          <FieldLabel>Server</FieldLabel>
          <TextInput style={styles.input} value={claimServer} onChangeText={setClaimServer} autoCapitalize="characters" />
          <SecondaryButton label="Submit claim" onPress={() => void claimAccount()} />
        </Card>

        <Card>
          <View style={styles.syncRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.section}>MT5 Live Sync</Text>
              <Text style={styles.muted}>
                {sync?.active ? "Active" : "Inactive"}
                {sync?.expiresAt ? ` · until ${new Date(sync.expiresAt).toLocaleDateString()}` : ""}
                {sync?.linkedAccountId ? `\nLinked: ${sync.linkedAccountId}` : ""}
              </Text>
            </View>
            <Switch value={Boolean(sync?.active)} onValueChange={(v) => void toggleSync(v)} />
          </View>
        </Card>

        {canCopy ? (
          <SecondaryButton
            label="Manage copy pool (web)"
            onPress={() => openWeb("/mt5/copy")}
          />
        ) : null}

        <Text style={styles.section}>More on web</Text>
        {[
          ["Submit setups", "/submit"],
          ["Leaderboard", "/leaderboard"],
          ["Payouts", "/payouts"],
          ["Dashboard", "/dashboard"],
        ].map(([label, path]) => (
          <Pressable key={path} onPress={() => openWeb(path)} style={styles.linkRow}>
            <Text style={styles.link}>{label}</Text>
          </Pressable>
        ))}

        <PrimaryButton
          label="Log out"
          onPress={() => void logout()}
          color={colors.sell}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 4 },
  section: { color: colors.text, fontWeight: "700", marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    marginBottom: 10,
  },
  methodRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.divider },
  chipActive: { borderColor: colors.buy, backgroundColor: "rgba(74,158,255,0.1)" },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  accountRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  accountName: { color: colors.text, fontWeight: "600" },
  syncRow: { flexDirection: "row", alignItems: "center" },
  linkRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  link: { color: colors.buy, fontWeight: "600" },
});
