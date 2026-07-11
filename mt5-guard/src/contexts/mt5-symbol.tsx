import React, { createContext, useContext, useMemo, useState } from "react";

type Mt5SymbolContextValue = {
  symbol: string;
  setSymbol: (symbol: string) => void;
};

const Mt5SymbolContext = createContext<Mt5SymbolContextValue | null>(null);

export function Mt5SymbolProvider({ children }: { children: React.ReactNode }) {
  const [symbol, setSymbol] = useState("XAUUSD");
  const value = useMemo(() => ({ symbol, setSymbol }), [symbol]);
  return <Mt5SymbolContext.Provider value={value}>{children}</Mt5SymbolContext.Provider>;
}

export function useMt5Symbol() {
  const ctx = useContext(Mt5SymbolContext);
  if (!ctx) throw new Error("useMt5Symbol must be used within Mt5SymbolProvider");
  return ctx;
}
