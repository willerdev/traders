import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/stores/theme";

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme.statusBar} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
        <ThemedStatusBar />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
