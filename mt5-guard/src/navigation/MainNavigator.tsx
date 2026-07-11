import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WalletScreen } from "../screens/WalletScreen";
import { ChartsScreen } from "../screens/ChartsScreen";
import { TradeScreen } from "../screens/TradeScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { Mt5SymbolProvider } from "../contexts/mt5-symbol";
import { useTheme } from "../stores/theme";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, color: string) {
  return <Ionicons name={name} size={22} color={color} />;
}

export function MainNavigator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);
  const tabBarHeight = 56 + bottomPad;

  return (
    <Mt5SymbolProvider>
      <Tab.Navigator
        initialRouteName="Charts"
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
          tabBarActiveTintColor: theme.buy,
          tabBarInactiveTintColor: theme.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        }}
      >
        <Tab.Screen
          name="Wallet"
          component={WalletScreen}
          options={{
            tabBarIcon: ({ color, focused }) =>
              tabIcon(focused ? "wallet" : "wallet-outline", color),
          }}
        />
        <Tab.Screen
          name="Charts"
          component={ChartsScreen}
          options={{
            tabBarIcon: ({ color, focused }) =>
              tabIcon(focused ? "bar-chart" : "bar-chart-outline", color),
          }}
        />
        <Tab.Screen
          name="Trade"
          component={TradeScreen}
          options={{
            tabBarIcon: ({ color, focused }) =>
              tabIcon(focused ? "trending-up" : "trending-up-outline", color),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({ color, focused }) =>
              tabIcon(focused ? "time" : "time-outline", color),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: "none" },
          }}
        />
      </Tab.Navigator>
    </Mt5SymbolProvider>
  );
}
