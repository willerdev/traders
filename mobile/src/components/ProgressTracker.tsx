import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../stores/theme";

export type TrackerStep = {
  key: string;
  label: string;
};

type Props = {
  steps: TrackerStep[];
  /** 0-based index of the active step. Steps before are done. */
  activeIndex: number;
  /** When true, the active step is finished (all complete). */
  completed?: boolean;
};

export function ProgressTracker({ steps, activeIndex, completed }: Props) {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, activeIndex, completed]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.05],
  });

  return (
    <View style={styles.wrap}>
      {steps.map((step, index) => {
        const done = completed || index < activeIndex;
        const active = !completed && index === activeIndex;
        const upcoming = !done && !active;

        return (
          <View key={step.key} style={styles.stepCol}>
            <View style={styles.circleRow}>
              {index > 0 ? (
                <View
                  style={[
                    styles.line,
                    {
                      backgroundColor:
                        index <= activeIndex || completed
                          ? theme.primary
                          : theme.divider,
                    },
                  ]}
                />
              ) : (
                <View style={styles.lineSpacer} />
              )}

              <View style={styles.circleWrap}>
                {active ? (
                  <Animated.View
                    style={[
                      styles.ring,
                      {
                        borderColor: theme.primary,
                        opacity: ringOpacity,
                        transform: [{ scale }],
                      },
                    ]}
                  />
                ) : null}
                <Animated.View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: done || active ? theme.primary : theme.surfaceAlt,
                      borderColor: done || active ? theme.primary : theme.divider,
                      transform: active ? [{ scale }] : undefined,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: done || active ? theme.onPrimary : theme.muted,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {done ? "✓" : index + 1}
                  </Text>
                </Animated.View>
              </View>

              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.line,
                    {
                      backgroundColor:
                        index < activeIndex || completed
                          ? theme.primary
                          : theme.divider,
                    },
                  ]}
                />
              ) : (
                <View style={styles.lineSpacer} />
              )}
            </View>
            <Text
              style={{
                color: active || done ? theme.text : theme.muted,
                fontSize: 11,
                fontWeight: active ? "700" : "500",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {step.label}
            </Text>
            {upcoming ? null : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  stepCol: { flex: 1, alignItems: "center" },
  circleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  line: { flex: 1, height: 2, borderRadius: 1 },
  lineSpacer: { flex: 1 },
  circleWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  ring: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    zIndex: 1,
  },
});
