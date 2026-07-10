import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { WalletScreen } from "../screens/WalletScreen";
import { Mt5Screen } from "../screens/Mt5Screen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { colors } from "../theme/colors";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="MT5"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
        },
        tabBarActiveTintColor: colors.buy,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="MT5" component={Mt5Screen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
