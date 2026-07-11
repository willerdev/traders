import { StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { WEB_APP_URL } from "../config/env";
import { useTheme } from "../stores/theme";
import { PrimaryButton } from "./ui";

export function Mt5Paywall({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.text, { color: theme.muted }]}>
        Weekly trading access required. Renew on the web to unlock MT5.
      </Text>
      <PrimaryButton
        label="Renew on web"
        onPress={() => void Linking.openURL(`${WEB_APP_URL}/dashboard`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 28, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 12 },
  text: { marginBottom: 20, lineHeight: 22, fontSize: 15 },
});
