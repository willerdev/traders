import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../stores/theme";
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
import { MoreScreen } from "../screens/MoreScreen";
import { SavedWalletsScreen } from "../screens/settings/SavedWalletsScreen";
import { KycScreen } from "../screens/settings/KycScreen";
import { PayoutsScreen } from "../screens/PayoutsScreen";
import { RegistrationPaymentScreen } from "../screens/RegistrationPaymentScreen";
import { ChainEnrollScreen } from "../screens/ChainEnrollScreen";
import { TermsScreen } from "../screens/TermsScreen";
import type {
  HomeStackParamList,
  InvestStackParamList,
  JournalStackParamList,
  MainTabParamList,
  MoreStackParamList,
  WalletStackParamList,
} from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const JournalStack = createNativeStackNavigator<JournalStackParamList>();
const WalletStack = createNativeStackNavigator<WalletStackParamList>();
const InvestStack = createNativeStackNavigator<InvestStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, color: string, size = 22) {
  return <Ionicons name={name} size={size} color={color} />;
}

function InvestTabIcon({ focused, color }: { focused: boolean; color: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        marginTop: -14,
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? theme.primary : theme.primary,
        opacity: focused ? 1 : 0.92,
        shadowColor: theme.primary,
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Ionicons name="trending-up" size={24} color="#FFFFFF" />
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
      <InvestStack.Screen
        name="Unitrust"
        component={UnitrustScreen}
        options={{ title: "Unitrust" }}
      />
      <InvestStack.Screen
        name="Loans"
        component={LoansScreen}
        options={{ title: "Loans" }}
      />
      <InvestStack.Screen
        name="ChainEnroll"
        component={ChainEnrollScreen}
        options={{ title: "Chain vault" }}
      />
    </InvestStack.Navigator>
  );
}

function MoreStackNavigator() {
  const { theme } = useTheme();
  return (
    <MoreStack.Navigator screenOptions={stackScreenOptions(theme)}>
      <MoreStack.Screen name="MoreMain" component={MoreScreen} options={{ headerShown: false }} />
      <MoreStack.Screen
        name="MessagesMain"
        component={MessagesScreen}
        options={{ title: "Support" }}
      />
      <MoreStack.Screen
        name="SettingsMain"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <MoreStack.Screen name="Payouts" component={PayoutsScreen} options={{ title: "Payouts" }} />
      <MoreStack.Screen name="Terms" component={TermsScreen} options={{ title: "Terms" }} />
      <MoreStack.Screen name="Kyc" component={KycScreen} options={{ title: "KYC" }} />
      <MoreStack.Screen
        name="SavedWallets"
        component={SavedWalletsScreen}
        options={{ title: "Withdrawal wallets" }}
      />
      <MoreStack.Screen
        name="ChainEnroll"
        component={ChainEnrollScreen}
        options={{ title: "Chain vault" }}
      />
    </MoreStack.Navigator>
  );
}

export function MainNavigator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarHeight = 58 + bottomPad;

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
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
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
        name="Journal"
        component={JournalStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "book" : "book-outline", color),
        }}
      />
      <Tab.Screen
        name="Invest"
        component={InvestStackNavigator}
        options={{
          tabBarLabel: "Invest",
          tabBarIcon: ({ focused, color }) => (
            <InvestTabIcon focused={focused} color={color} />
          ),
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
        name="More"
        component={MoreStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) =>
            tabIcon(focused ? "menu" : "menu-outline", color),
        }}
      />
    </Tab.Navigator>
  );
}
