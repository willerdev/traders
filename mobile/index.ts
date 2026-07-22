import "react-native-gesture-handler";

// React Navigation 7 uses Array#findLast / findLastIndex (ES2023).
// Older Expo Go Hermes builds lack them and crash with:
// TypeError: undefined is not a function
if (typeof (Array.prototype as { findLast?: unknown }).findLast !== "function") {
  Object.defineProperty(Array.prototype, "findLast", {
    configurable: true,
    writable: true,
    value: function findLast(
      this: unknown[],
      predicate: (value: unknown, index: number, array: unknown[]) => unknown,
    ) {
      for (let i = this.length - 1; i >= 0; i -= 1) {
        if (predicate(this[i], i, this)) return this[i];
      }
      return undefined;
    },
  });
}

if (
  typeof (Array.prototype as { findLastIndex?: unknown }).findLastIndex !==
  "function"
) {
  Object.defineProperty(Array.prototype, "findLastIndex", {
    configurable: true,
    writable: true,
    value: function findLastIndex(
      this: unknown[],
      predicate: (value: unknown, index: number, array: unknown[]) => unknown,
    ) {
      for (let i = this.length - 1; i >= 0; i -= 1) {
        if (predicate(this[i], i, this)) return i;
      }
      return -1;
    },
  });
}

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
