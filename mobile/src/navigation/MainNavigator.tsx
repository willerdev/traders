import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../stores/theme";
import { HomeScreen } from "../screens/HomeScreen";
import { WalletScreen } from "../screens/WalletScreen";
import { DepositScreen } from "../screens/wallet/DepositScreen";
import { WithdrawScreen } from "../screens/wallet/WithdrawScreen";
import { TransactionsScreen } from "../screens/wallet/TransactionsScreen";
import { JournalScreen } from "../screens/JournalScreen";
import { InvestScreen } from "../screens/InvestScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SavedWalletsScreen } from "../screens/settings/SavedWalletsScreen";
import { PayoutsScreen } from "../screens/PayoutsScreen";
import { RegistrationPaymentScreen } from "../screens/RegistrationPaymentScreen";
import type {
  HomeStackParamList,
  InvestStackParamList,
  MainTabParamList,
  MessagesStackParamList,
  SettingsStackParamList,
  WalletStackParamList,
} from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const WalletStack = createNativeStackNavigator<WalletStackParamList>();
const InvestStack = createNativeStackNavigator<InvestStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, color: string) {
  return <Ionicons name={name} size={22} color={color} />;
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
      <HomeStack.Screen name="Journal" component={JournalScreen} options={{ title: "Income journal" }} />
      <HomeStack.Screen name="Payouts" component={PayoutsScreen} options={{ title: "Payouts" }} />
    </HomeStack.Navigator>
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
    </InvestStack.Navigator>
  );
}

function MessagesStackNavigator() {
  const { theme } = useTheme();
  return (
    <MessagesStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <MessagesStack.Screen
        name="MessagesMain"
        component={MessagesScreen}
        options={{ headerShown: false }}
      />
    </MessagesStack.Navigator>
  );
}

function SettingsStackNavigator() {
  const { theme } = useTheme();
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} options={{ headerShown: false }} />
    </SettingsStack.Navigator>
  );
}

export function MainNavigator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);
  const tabBarHeight = 56 + bottomPad;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "home" : "home-outline", color),
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "wallet" : "wallet-outline", color),
        }}
      />
      <Tab.Screen
        name="Invest"
        component={InvestStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "trending-up" : "trending-up-outline", color),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "chatbubbles" : "chatbubbles-outline", color),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "settings" : "settings-outline", color),
        }}
      />
    </Tab.Navigator>
  );
}
