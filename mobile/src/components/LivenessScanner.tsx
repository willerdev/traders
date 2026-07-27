import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useTheme } from "../stores/theme";
import { PrimaryButton } from "./ui";

const POSES = [
  { label: "Look straight at the camera", holdMs: 1400 },
  { label: "Slowly turn your head left", holdMs: 1600 },
  { label: "Slowly turn your head right", holdMs: 1600 },
  { label: "Return to center and hold", holdMs: 1400 },
] as const;

const TICKS = 48;

type Props = {
  onComplete: (selfieUri: string) => void;
  onCancel?: () => void;
};

export function LivenessScanner({ onComplete, onCancel }: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 64, 300);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!permission?.granted) void requestPermission();
  }, [permission?.granted, requestPermission]);

  useEffect(() => {
    if (!ready || done || started.current) return;
    started.current = true;
    let cancelled = false;
    let pose = 0;

    async function run() {
      while (!cancelled && pose < POSES.length) {
        setPoseIndex(pose);
        const start = Date.now();
        const hold = POSES[pose].holdMs;
        await new Promise<void>((resolve) => {
          const tick = () => {
            if (cancelled) {
              resolve();
              return;
            }
            const t = Math.min(1, (Date.now() - start) / hold);
            setProgress(pose / POSES.length + t / POSES.length);
            if (t >= 1) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        pose += 1;
      }
      if (cancelled) return;
      try {
        const shot = await cameraRef.current?.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
        });
        if (shot?.uri) setSelfieUri(shot.uri);
      } catch {
        /* ignore */
      }
      setProgress(1);
      setDone(true);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [ready, done]);

  const filled = Math.round(progress * TICKS);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.text, textAlign: "center", marginBottom: 12 }}>
          Camera permission is required for liveness.
        </Text>
        <PrimaryButton label="Allow camera" onPress={() => void requestPermission()} />
        {onCancel ? (
          <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: TICKS }).map((_, i) => {
            const angle = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
            const r = size / 2 - 6;
            const len = 8;
            const cx = size / 2;
            const cy = size / 2;
            const x1 = cx + Math.cos(angle) * (r - len);
            const y1 = cy + Math.sin(angle) * (r - len);
            const active = i < filled;
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: x1,
                  top: y1,
                  width: len,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: done
                    ? "#34D399"
                    : active
                      ? "#8B5CF6"
                      : theme.divider,
                  transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }],
                }}
              />
            );
          })}
        </View>
        <View
          style={{
            position: "absolute",
            left: size * 0.1,
            top: size * 0.1,
            width: size * 0.8,
            height: size * 0.8,
            borderRadius: size * 0.4,
            overflow: "hidden",
            backgroundColor: "#000",
          }}
        >
          {!done ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              onCameraReady={() => setReady(true)}
            />
          ) : null}
          {!ready && !done ? (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
      </View>

      <Text style={[styles.hint, { color: theme.text }]}>
        {done
          ? "Liveness verified"
          : ready
            ? POSES[Math.min(poseIndex, POSES.length - 1)].label
            : "Starting camera…"}
      </Text>

      {done ? (
        <PrimaryButton
          label="Continue"
          onPress={() => selfieUri && onComplete(selfieUri)}
          disabled={!selfieUri}
        />
      ) : null}
      {!done && onCancel ? (
        <PrimaryButton label="Cancel" variant="ghost" onPress={onCancel} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 14, paddingVertical: 8 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  hint: { fontSize: 14, fontWeight: "600", textAlign: "center" },
});
