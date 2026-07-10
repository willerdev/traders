import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useAppActive(callback: () => void, active: boolean, ms: number) {
  const appActive = useRef(AppState.currentState === "active");
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      appActive.current = state === "active";
      if (state === "active" && active) cbRef.current();
    });
    return () => sub.remove();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    cbRef.current();
    const id = setInterval(() => {
      if (appActive.current) cbRef.current();
    }, ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
