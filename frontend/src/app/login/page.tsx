"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth";
import { resolveReturnTo } from "@/lib/return-to";

const LOGIN_SESSION_KEY = "trp-login-session";
const LOGIN_EMAIL_KEY = "trp-login-email";

function readSavedLoginSession() {
  if (typeof window === "undefined") return { sessionId: "", email: "" };
  return {
    sessionId: sessionStorage.getItem(LOGIN_SESSION_KEY) ?? "",
    email: sessionStorage.getItem(LOGIN_EMAIL_KEY) ?? "",
  };
}

function saveLoginSession(sessionId: string, emailAddress: string) {
  sessionStorage.setItem(LOGIN_SESSION_KEY, sessionId);
  sessionStorage.setItem(LOGIN_EMAIL_KEY, emailAddress);
}

function clearLoginSession() {
  sessionStorage.removeItem(LOGIN_SESSION_KEY);
  sessionStorage.removeItem(LOGIN_EMAIL_KEY);
}

function resolveSessionId(stateSessionId: string) {
  if (stateSessionId.trim()) return stateSessionId.trim();
  return readSavedLoginSession().sessionId.trim();
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startLogin, verifyLoginOtp, resendLoginOtp, isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loginSessionId, setLoginSessionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (searchParams.get("reset") === "1") {
      setNotice("Password updated. Sign in with your new password.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(resolveReturnTo(searchParams));
    }
  }, [isAuthenticated, router, searchParams]);

  useEffect(() => {
    const saved = readSavedLoginSession();
    if (saved.sessionId && saved.email) {
      setLoginSessionId(saved.sessionId);
      setEmail(saved.email);
      setStep("otp");
    }
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  if (isAuthenticated) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await startLogin(email, password);

      if ("accessToken" in res && typeof res.accessToken === "string") {
        clearLoginSession();
        router.replace(resolveReturnTo(searchParams));
        return;
      }

      if (!("requiresOtp" in res) || !res.loginSessionId?.trim()) {
        throw new Error("Sign-in could not start. Please try again.");
      }

      const sessionId = res.loginSessionId.trim();

      saveLoginSession(sessionId, res.email || email.trim().toLowerCase());
      setLoginSessionId(sessionId);
      setEmail(res.email || email.trim().toLowerCase());
      setStep("otp");
      setOtp("");
      setResendCooldown(60);
    } catch (err) {
      clearLoginSession();
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const sessionId = resolveSessionId(loginSessionId);
    if (!sessionId) {
      setError("Session expired. Enter your email and password again.");
      setStep("credentials");
      clearLoginSession();
      return;
    }

    setLoading(true);
    try {
      await verifyLoginOtp(sessionId, otp.trim());
      clearLoginSession();
      router.replace(resolveReturnTo(searchParams));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;

    const sessionId = resolveSessionId(loginSessionId);
    if (!sessionId) {
      setError("Session expired. Enter your email and password again.");
      setStep("credentials");
      clearLoginSession();
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await resendLoginOtp(sessionId);
      const nextSessionId = res.loginSessionId?.trim() || sessionId;
      saveLoginSession(nextSessionId, email);
      setLoginSessionId(nextSessionId);
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep("credentials");
    setError("");
    setOtp("");
    clearLoginSession();
    setLoginSessionId("");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {step === "credentials" ? "Welcome Back" : "Check your email"}
            </CardTitle>
            <CardDescription>
              {step === "credentials"
                ? "Sign in to your TraderRank Pro account"
                : `We sent a 6-digit code to ${email}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "credentials" ? (
              <form onSubmit={handleCredentials} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="trader@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {notice && !error && (
                  <p className="text-sm text-success">{notice}</p>
                )}
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending code..." : "Continue"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Sign-in code</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    required
                    className="text-center text-lg tracking-[0.35em] font-mono"
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? "Verifying..." : "Sign in"}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted hover:text-foreground"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    className="text-primary hover:underline disabled:opacity-50"
                    disabled={loading || resendCooldown > 0}
                    onClick={() => void handleResend()}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}
            <p className="mt-6 text-center text-sm text-gray-400">
              New here?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Invite-only registration
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
