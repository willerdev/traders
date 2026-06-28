"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const { startLogin, verifyLoginOtp, resendLoginOtp, isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loginSessionId, setLoginSessionId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

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
      setLoginSessionId(res.loginSessionId);
      setStep("otp");
      setOtp("");
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyLoginOtp(loginSessionId, otp.trim());
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      const res = await resendLoginOtp(loginSessionId);
      setLoginSessionId(res.loginSessionId);
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setLoading(false);
    }
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
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
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
                    onClick={() => {
                      setStep("credentials");
                      setError("");
                      setOtp("");
                    }}
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
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Register
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
