import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../stores/theme";
import { useAuth } from "../stores/auth";
import { usePin } from "../stores/pin";
import { BrandMark } from "./ui";
import { navigateMain } from "../navigation/navigationRef";

type SidebarContextValue = {
  open: () => void;
  close: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
      <AppSidebar visible={visible} onClose={close} />
    </SidebarContext.Provider>
  );
}

function AppSidebar({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { lock } = usePin();
  const insets = useSafeAreaInsets();

  function go(tab: string, screen?: string) {
    onClose();
    setTimeout(() => navigateMain(tab, screen), 40);
  }

  const items: {
    key: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }[] = [
    {
      key: "unitrust",
      title: "Unitrust",
      icon: "shield-checkmark-outline",
      onPress: () => go("Invest", "Unitrust"),
    },
    {
      key: "invest",
      title: "Smart Invest",
      icon: "trending-up-outline",
      onPress: () => go("Invest"),
    },
    {
      key: "loans",
      title: "Loans",
      icon: "cash-outline",
      onPress: () => go("Invest", "Loans"),
    },
    {
      key: "chain",
      title: "Chain vault",
      icon: "cube-outline",
      onPress: () => go("Invest", "ChainEnroll"),
    },
    {
      key: "journal",
      title: "Journal",
      icon: "book-outline",
      onPress: () => go("Journal"),
    },
    {
      key: "support",
      title: "Support",
      icon: "chatbubbles-outline",
      onPress: () => go("Account", "MessagesMain"),
    },
    {
      key: "wallets",
      title: "Withdrawal wallets",
      icon: "wallet-outline",
      onPress: () => go("Account", "SavedWallets"),
    },
    {
      key: "kyc",
      title: "KYC",
      icon: "id-card-outline",
      onPress: () => go("Account", "Kyc"),
    },
    {
      key: "settings",
      title: "Settings",
      icon: "settings-outline",
      onPress: () => go("Account", "SettingsMain"),
    },
    {
      key: "terms",
      title: "Terms",
      icon: "document-text-outline",
      onPress: () => go("Account", "Terms"),
    },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.drawer,
            {
              backgroundColor: theme.surface,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.head}>
            <BrandMark size="sm" />
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.muted} />
            </Pressable>
          </View>
          <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 18 }}>
            {user?.displayName ?? user?.email ?? "Account"}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
                  <Ionicons name={item.icon} size={18} color={theme.primary} />
                </View>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => {
              onClose();
              lock();
            }}
            style={[styles.footerBtn, { borderColor: theme.divider }]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={theme.text} />
            <Text style={{ color: theme.text, fontWeight: "700" }}>Lock app</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onClose();
              void logout();
            }}
            style={[styles.footerBtn, { borderColor: theme.divider, marginTop: 10 }]}
          >
            <Ionicons name="log-out-outline" size={18} color={theme.danger} />
            <Text style={{ color: theme.danger, fontWeight: "700" }}>Sign out</Text>
          </Pressable>
        </View>
        <Pressable style={styles.backdrop} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  drawer: {
    width: "78%",
    maxWidth: 320,
    paddingHorizontal: 18,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
