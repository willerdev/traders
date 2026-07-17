"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, Users } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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
  const [referralCode, setReferralCode] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref?.trim()) setReferralCode(ref.trim().toUpperCase());
    setReady(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!referralCode.trim()) {
      setError("A referral invite is required to join");
      return;
    }
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
      await register(
        email,
        password,
        displayName,
        true,
        referralCode.trim().toUpperCase(),
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
              ✓
            </div>
            <h2 className="text-xl font-bold text-white">
              Registration Successful
            </h2>
            <p className="mt-2 text-gray-400">
              Sign in and complete registration to start. Identity verification
              is only required when you request a payout.
            </p>
            <Button className="mt-6" onClick={() => router.push("/login")}>
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!referralCode) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
                <Lock className="h-5 w-5" />
              </div>
              <Badge variant="secondary" className="mx-auto mb-3 w-fit">
                Closed community
              </Badge>
              <CardTitle className="text-2xl">Invite only</CardTitle>
              <CardDescription className="text-base text-gray-400">
                Registrations are done through referrals only. This is a closed
                community — ask a current member for their invite link to join.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-gray-400">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Members can share a personal referral link from Settings. Open
                  that link to create your account.
                </p>
              </div>
              <Link href="/login" className="block">
                <Button className="w-full" variant="secondary">
                  Already invited? Sign in
                </Button>
              </Link>
              <p className="text-center text-xs text-gray-600">
                Direct public registration is disabled.
              </p>
            </CardContent>
          </Card>
        </motion.div>
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
            <Badge variant="gold" className="mx-auto mb-3 w-fit">
              Referral invite
            </Badge>
            <CardTitle className="text-2xl">Join TraderRank Pro</CardTitle>
            <CardDescription>
              You were invited — complete signup below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="Your trader name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={40}
                />
                <p className="text-xs text-gray-500">
                  Cannot use names like admin, platform, support, or other
                  official-sounding titles.
                </p>
              </div>
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
                  I accept the Terms of Service and Risk Disclosure. I understand
                  trading involves substantial risk and virtual accounts do not
                  guarantee real profits.
                </span>
              </label>
              <p className="text-xs text-success">
                Referral code{" "}
                <span className="font-mono">{referralCode}</span> applied — you
                were invited by a friend.
              </p>
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
