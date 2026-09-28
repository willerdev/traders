"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth";
import { validateDisplayName } from "@/lib/display-name";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!acceptTerms) {
      setError("You must accept the terms and risk disclosure");
      return;
    }
    const nameError = validateDisplayName(displayName);
    if (nameError) {
      setError(nameError);
      return;
    }
    setLoading(true);
    try {
      await register(email, password, displayName, true);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
              ✓
            </div>
            <h2 className="text-xl font-bold text-white">Account created</h2>
            <p className="mt-2 text-gray-400">
              Sign in to open your wallet. Identity verification is only
              required when you request a payout.
            </p>
            <Button className="mt-6" onClick={() => router.push("/login")}>
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>Join solo Emma with email and password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <label className="flex items-start gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 rounded border-[var(--color-border)]"
                />
                <span>
                  I accept the{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    Terms &amp; Conditions
                  </Link>{" "}
                  and understand that trading involves substantial risk.
                </span>
              </label>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !acceptTerms}
              >
                {loading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-gray-400">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
