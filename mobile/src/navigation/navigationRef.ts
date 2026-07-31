import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateMain(
  tab: string,
  screen?: string,
  params?: Record<string, unknown>,
) {
  if (!navigationRef.isReady()) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = navigationRef as any;
  if (screen) {
    ref.navigate("Main", { screen: tab, params: { screen, params } });
  } else {
    ref.navigate("Main", { screen: tab });
  }
}
