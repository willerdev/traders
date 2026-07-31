import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../stores/theme";
import { SidebarProvider, useSidebar } from "../components/AppSidebar";
import { HomeScreen } from "../screens/HomeScreen";
import { WalletScreen } from "../screens/WalletScreen";
import { DepositScreen } from "../screens/wallet/DepositScreen";
import { WithdrawScreen } from "../screens/wallet/WithdrawScreen";
import { TransactionsScreen } from "../screens/wallet/TransactionsScreen";
import { JournalScreen } from "../screens/JournalScreen";
import { InvestScreen } from "../screens/InvestScreen";
import { UnitrustScreen } from "../screens/UnitrustScreen";
import { LoansScreen } from "../screens/LoansScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SavedWalletsScreen } from "../screens/settings/SavedWalletsScreen";
import { KycScreen } from "../screens/settings/KycScreen";
import { PayoutsScreen } from "../screens/PayoutsScreen";
import { RegistrationPaymentScreen } from "../screens/RegistrationPaymentScreen";
import { ChainEnrollScreen } from "../screens/ChainEnrollScreen";
import { TermsScreen } from "../screens/TermsScreen";
import type {
  AccountStackParamList,
  HomeStackParamList,
  InvestStackParamList,
  JournalStackParamList,
  MainTabParamList,
  WalletStackParamList,
} from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const JournalStack = createNativeStackNavigator<JournalStackParamList>();
const WalletStack = createNativeStackNavigator<WalletStackParamList>();
const InvestStack = createNativeStackNavigator<InvestStackParamList>();
const AccountStack = createNativeStackNavigator<AccountStackParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  focused,
  color,
}: {
  name: IconName;
  focused: boolean;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name} size={24} color={color} />
      {focused ? (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: theme.primary,
            marginTop: 4,
          }}
        />
      ) : (
        <View style={{ height: 9 }} />
      )}
    </View>
  );
}

function stackScreenOptions(theme: { bg: string; text: string }) {
  return {
    headerStyle: { backgroundColor: theme.bg },
    headerTintColor: theme.text,
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.bg },
  };
}

function HomeStackNavigator() {
  const { theme } = useTheme();
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen
        name="RegistrationPayment"
        component={RegistrationPaymentScreen}
        options={{ title: "Activate account" }}
      />
      <HomeStack.Screen name="Payouts" component={PayoutsScreen} options={{ title: "Payouts" }} />
    </HomeStack.Navigator>
  );
}

function JournalStackNavigator() {
  const { theme } = useTheme();
  return (
    <JournalStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <JournalStack.Screen
        name="JournalMain"
        component={JournalScreen}
        options={{ headerShown: false }}
      />
    </JournalStack.Navigator>
  );
}

function WalletStackNavigator() {
  const { theme } = useTheme();
  return (
    <WalletStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <WalletStack.Screen name="WalletMain" component={WalletScreen} options={{ headerShown: false }} />
      <WalletStack.Screen name="Deposit" component={DepositScreen} options={{ title: "Deposit" }} />
      <WalletStack.Screen name="Withdraw" component={WithdrawScreen} options={{ title: "Withdraw" }} />
      <WalletStack.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ title: "Transactions" }}
      />
      <WalletStack.Screen name="Journal" component={JournalScreen} options={{ title: "Income journal" }} />
      <WalletStack.Screen
        name="SavedWallets"
        component={SavedWalletsScreen}
        options={{ title: "Withdrawal wallets" }}
      />
    </WalletStack.Navigator>
  );
}

function InvestStackNavigator() {
  const { theme } = useTheme();
  return (
    <InvestStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <InvestStack.Screen name="InvestMain" component={InvestScreen} options={{ headerShown: false }} />
      <InvestStack.Screen name="Unitrust" component={UnitrustScreen} options={{ title: "Unitrust" }} />
      <InvestStack.Screen name="Loans" component={LoansScreen} options={{ title: "Loans" }} />
      <InvestStack.Screen
        name="ChainEnroll"
        component={ChainEnrollScreen}
        options={{ title: "Chain vault" }}
      />
    </InvestStack.Navigator>
  );
}

function AccountHome() {
  const { theme } = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}

function AccountStackNavigator() {
  const { theme } = useTheme();
  return (
    <AccountStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <AccountStack.Screen name="AccountMain" component={AccountHome} options={{ headerShown: false }} />
      <AccountStack.Screen
        name="MessagesMain"
        component={MessagesScreen}
        options={{ title: "Support" }}
      />
      <AccountStack.Screen
        name="SettingsMain"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <AccountStack.Screen name="Payouts" component={PayoutsScreen} options={{ title: "Payouts" }} />
      <AccountStack.Screen name="Terms" component={TermsScreen} options={{ title: "Terms" }} />
      <AccountStack.Screen name="Kyc" component={KycScreen} options={{ title: "KYC" }} />
      <AccountStack.Screen
        name="SavedWallets"
        component={SavedWalletsScreen}
        options={{ title: "Withdrawal wallets" }}
      />
      <AccountStack.Screen
        name="ChainEnroll"
        component={ChainEnrollScreen}
        options={{ title: "Chain vault" }}
      />
      <AccountStack.Screen name="Unitrust" component={UnitrustScreen} options={{ title: "Unitrust" }} />
    </AccountStack.Navigator>
  );
}

function AccountTabButton() {
  const { open } = useSidebar();
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => open()}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      accessibilityRole="button"
      accessibilityLabel="Menu"
    >
      <TabIcon name="person-outline" focused={false} color={theme.muted} />
    </Pressable>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPad;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "wallet" : "wallet-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Journal"
        component={JournalStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "book" : "book-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Invest"
        component={InvestStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "trending-up" : "trending-up-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountStackNavigator}
        options={{
          tabBarButton: () => <AccountTabButton />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? "person" : "person-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  return (
    <SidebarProvider>
      <MainTabs />
    </SidebarProvider>
  );
}
