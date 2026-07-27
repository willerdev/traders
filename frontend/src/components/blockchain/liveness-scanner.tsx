"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, CheckCircle2, Loader2, SunMedium, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POSES = [
  { id: "center", label: "Look straight at the camera", holdMs: 1400 },
  { id: "left", label: "Slowly turn your head left", holdMs: 1600 },
  { id: "right", label: "Slowly turn your head right", holdMs: 1600 },
  { id: "center2", label: "Return to center and hold", holdMs: 1400 },
] as const;

const TICK_COUNT = 64;
/** Perfect circle: same radius for ring + face mask (viewBox 0–100). */
const RING_R = 46;
const TICK_LEN = 3.2;
const FACE_R = 40;

type Quality = {
  brightness: number;
  sharpness: number;
  ok: boolean;
  message: string;
};

type Props = {
  onComplete: (selfieDataUrl: string) => void;
  onCancel?: () => void;
};

function sampleQuality(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Quality | null {
  if (!video.videoWidth) return null;
  const w = 96;
  const h = 96;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // Center crop (face region)
  const side = Math.min(video.videoWidth, video.videoHeight) * 0.55;
  const sx = (video.videoWidth - side) / 2;
  const sy = (video.videoHeight - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let sum = 0;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    sum += g;
  }
  const brightness = sum / gray.length;

  // Laplacian variance ≈ sharpness
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v =
        -4 * gray[i] +
        gray[i - 1] +
        gray[i + 1] +
        gray[i - w] +
        gray[i + w];
      lapSum += v;
      lapSq += v * v;
      n++;
    }
  }
  const mean = lapSum / n;
  const sharpness = lapSq / n - mean * mean;

  if (brightness < 55) {
    return {
      brightness,
      sharpness,
      ok: false,
      message: "Room is too dark — face a light source",
    };
  }
  if (brightness > 220) {
    return {
      brightness,
      sharpness,
      ok: false,
      message: "Too bright / glare — move away from strong light",
    };
  }
  if (sharpness < 28) {
    return {
      brightness,
      sharpness,
      ok: false,
      message: "Face is unclear — hold steady and move closer",
    };
  }
  return {
    brightness,
    sharpness,
    ok: true,
    message: "Lighting and face look clear",
  };
}

export function LivenessScanner({ onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qualityCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [qualityReady, setQualityReady] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const startedRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setError(
          "Camera access is required for liveness. Allow camera permission and retry.",
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  // Continuous lighting / clarity gate before poses start
  useEffect(() => {
    if (!ready || done || qualityReady) return;
    let cancelled = false;
    let goodFrames = 0;

    const id = window.setInterval(() => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = qualityCanvasRef.current;
      if (!video || !canvas) return;
      const q = sampleQuality(video, canvas);
      if (!q) return;
      setQuality(q);
      if (q.ok) {
        goodFrames += 1;
        if (goodFrames >= 4) setQualityReady(true);
      } else {
        goodFrames = 0;
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, done, qualityReady]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  useEffect(() => {
    if (!ready || !qualityReady || done || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let pose = 0;

    async function runPose() {
      if (cancelled || pose >= POSES.length) return;
      setPoseIndex(pose);
      setHolding(true);
      const poseProgressStart = pose / POSES.length;
      const poseShare = 1 / POSES.length;
      const hold = POSES[pose].holdMs;
      const started = Date.now();

      await new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelled) {
            resolve();
            return;
          }
          const t = Math.min(1, (Date.now() - started) / hold);
          setProgress(poseProgressStart + t * poseShare);
          if (t >= 1) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      if (cancelled) return;
      pose += 1;
      if (pose >= POSES.length) {
        const frame = captureFrame();
        setHolding(false);
        setProgress(1);
        setDone(true);
        if (frame) setSelfie(frame);
        stopCamera();
        return;
      }
      setHolding(false);
      await new Promise((r) => setTimeout(r, 350));
      void runPose();
    }

    void runPose();
    return () => {
      cancelled = true;
    };
  }, [ready, qualityReady, done, captureFrame, stopCamera]);

  const ticksFilled = Math.round(progress * TICK_COUNT);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center">
      {/* Perfect square → perfect circle */}
      <div className="relative aspect-square w-full max-w-[300px]">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const angle = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
            const rInner = RING_R - TICK_LEN;
            const rOuter = RING_R;
            const x1 = 50 + Math.cos(angle) * rInner;
            const y1 = 50 + Math.sin(angle) * rInner;
            const x2 = 50 + Math.cos(angle) * rOuter;
            const y2 = 50 + Math.sin(angle) * rOuter;
            const active = i < ticksFilled;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeLinecap="round"
                strokeWidth={1.5}
                className={cn(
                  "transition-colors duration-150",
                  done
                    ? "stroke-emerald-400"
                    : active
                      ? "stroke-violet-500"
                      : "stroke-neutral-300",
                )}
                style={
                  !done && active
                    ? {
                        stroke: `hsl(${255 + (i / TICK_COUNT) * 35}, 82%, 58%)`,
                      }
                    : undefined
                }
              />
            );
          })}
        </svg>

        <div
          className="absolute overflow-hidden bg-black shadow-inner"
          style={{
            inset: `${50 - FACE_R}%`,
            borderRadius: "50%",
          }}
        >
          {!done ? (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full scale-x-[-1] object-cover"
            />
          ) : selfie ? (
            <motion.img
              initial={{ opacity: 0.6, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              src={selfie}
              alt="Liveness capture"
              className="h-full w-full scale-x-[-1] object-cover"
            />
          ) : null}
          {!ready && !error && !done && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={qualityCanvasRef} className="hidden" />

      <div className="mt-5 flex items-center gap-2 text-center">
        {qualityReady || done ? (
          <UserRound className="h-4 w-4 text-muted" />
        ) : (
          <SunMedium className="h-4 w-4 text-amber-300" />
        )}
        <p className="text-sm font-medium text-foreground">
          {done
            ? "Liveness verified"
            : !qualityReady
              ? quality?.message || "Checking lighting and face clarity…"
              : ready
                ? POSES[Math.min(poseIndex, POSES.length - 1)].label
                : "Starting camera…"}
        </p>
      </div>

      {!qualityReady && quality && !done && (
        <p
          className={cn(
            "mt-1 text-xs",
            quality.ok ? "text-emerald-400" : "text-amber-300",
          )}
        >
          {quality.ok
            ? "Hold still — starting head-turn checks…"
            : "Improve lighting / focus to continue"}
        </p>
      )}

      {holding && !done && qualityReady && (
        <p className="mt-1 text-xs text-muted">Hold still…</p>
      )}

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex w-full flex-col items-center gap-3"
        >
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            Scan complete — face verified
          </div>
          <Button
            className="w-full"
            onClick={() => selfie && onComplete(selfie)}
            disabled={!selfie}
          >
            Continue
          </Button>
        </motion.div>
      )}

      {error && (
        <div className="mt-4 w-full space-y-3 text-center">
          <p className="text-sm text-danger">{error}</p>
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={() => window.location.reload()}
          >
            <Camera className="h-4 w-4" />
            Retry camera
          </Button>
        </div>
      )}

      {!done && onCancel && (
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          className="mt-4 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/** Upload a data-URL JPEG via the KYC upload endpoint. */
export async function uploadLivenessDataUrl(
  dataUrl: string,
  uploadFn: (file: File) => Promise<{ url: string }>,
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], `liveness-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
  const uploaded = await uploadFn(file);
  return uploaded.url;
}
