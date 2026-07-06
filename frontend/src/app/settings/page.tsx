"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  User,
  MapPin,
  ShieldCheck,
  Moon,
  Sun,
  LogOut,
  Upload,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth";
import { AuthLoadingScreen, useRequireAuth } from "@/hooks/use-require-auth";
import { useThemeStore } from "@/stores/theme";
import { api, type UserSettings, type KycRecord, type MetaApiAccountRow } from "@/lib/api";
import { validateDisplayName } from "@/lib/display-name";
import { cn } from "@/lib/utils";
import { AuthenticatedImage } from "@/components/ui/authenticated-image";
import { ReferralCard } from "@/components/settings/referral-card";

const KYC_STATUS: Record<
  KycRecord["status"],
  { label: string; variant: "default" | "success" | "danger" | "secondary" | "gold"; icon: typeof CheckCircle2 }
> = {
  NOT_STARTED: { label: "Not started", variant: "secondary", icon: ShieldCheck },
  PENDING: { label: "Under review", variant: "gold", icon: Clock },
  APPROVED: { label: "Verified", variant: "success", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", variant: "danger", icon: XCircle },
};

function KycUploadField({
  label,
  url,
  onUpload,
  onClear,
  disabled,
}: {
  label: string;
  url: string;
  onUpload: (url: string) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploads.kyc(file);
      onUpload(result.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      {url ? (
        <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)]">
          <AuthenticatedImage
            src={url}
            alt={label}
            className="max-h-32 w-full object-contain bg-black/20"
          />
          {!disabled && (
            <div className="absolute bottom-2 right-2 flex gap-2">
              {onClear && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onClear}
                >
                  Remove
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-8 text-sm text-muted hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Uploading..." : "Upload image"}
        </button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const { logout, setAuth, token } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycRetrying, setKycRetrying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [metaApiAccounts, setMetaApiAccounts] = useState<MetaApiAccountRow[]>([]);
  const [tradingAccountId, setTradingAccountId] = useState<string>("");
  const [tradingSaving, setTradingSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({
    displayName: "",
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: "",
  });

  const [addressForm, setAddressForm] = useState({
    country: "",
    state: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
  });

  const [kycForm, setKycForm] = useState({
    documentType: "PASSPORT" as "PASSPORT" | "NATIONAL_ID" | "DRIVERS_LICENSE",
    documentNumber: "",
    documentFrontUrl: "",
    documentBackUrl: "",
    selfieUrl: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    payoutMethod: "TRC20" as "TRC20" | "MOBILE_MONEY",
    trc20Address: "",
    mobileMoneyProvider: "",
    mobileMoneyNumber: "",
    mobileMoneyAccountName: "",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void loadSettings();
  }, [ready]);

  if (!ready) {
    return <AuthLoadingScreen />;
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await api.users.settings();
      setSettings(data);
      setProfileForm({
        displayName: data.user.displayName ?? "",
        firstName: data.profile?.firstName ?? "",
        lastName: data.profile?.lastName ?? "",
        phone: data.profile?.phone ?? "",
        dateOfBirth: data.profile?.dateOfBirth
          ? data.profile.dateOfBirth.slice(0, 10)
          : "",
      });
      setAddressForm({
        country: data.profile?.country ?? "",
        state: data.profile?.state ?? "",
        city: data.profile?.city ?? "",
        addressLine1: data.profile?.addressLine1 ?? "",
        addressLine2: data.profile?.addressLine2 ?? "",
        postalCode: data.profile?.postalCode ?? "",
      });
      if (data.kyc?.documentType) {
        setKycForm({
          documentType: data.kyc.documentType,
          documentNumber: data.kyc.documentNumber ?? "",
          documentFrontUrl: data.kyc.documentFrontUrl ?? "",
          documentBackUrl: data.kyc.documentBackUrl ?? "",
          selfieUrl: data.kyc.selfieUrl ?? "",
        });
      }
      setPaymentForm({
        payoutMethod: data.profile?.payoutMethod ?? "TRC20",
        trc20Address: data.profile?.trc20Address ?? "",
        mobileMoneyProvider: data.profile?.mobileMoneyProvider ?? "",
        mobileMoneyNumber: data.profile?.mobileMoneyNumber ?? "",
        mobileMoneyAccountName: data.profile?.mobileMoneyAccountName ?? "",
      });
      setTradingAccountId(data.user.metaApiAccountId ?? "");
      if (data.metaApi?.configured) {
        try {
          const accounts = await api.signals.metaApiAccounts();
          setMetaApiAccounts(accounts.items ?? []);
        } catch {
          setMetaApiAccounts([]);
        }
      } else {
        setMetaApiAccounts([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError("");
    setMessage("");
    const nameError = validateDisplayName(profileForm.displayName);
    if (nameError) {
      setError(nameError);
      setSaving(false);
      return;
    }
    try {
      const updated = await api.users.updateProfile(profileForm);
      setSettings(updated);
      if (token && updated.user) {
        setAuth(token, {
          id: updated.user.id,
          displayName: updated.user.displayName,
          email: updated.user.email ?? undefined,
          role: updated.user.role,
          status: updated.user.status,
        });
      }
      setMessage("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function saveAddress() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.users.updateAddress(addressForm);
      setSettings(updated);
      setMessage("Address saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save address");
    } finally {
      setSaving(false);
    }
  }

  async function savePaymentDetails() {
    setPaymentSaving(true);
    setError("");
    setMessage("");
    try {
      const payload =
        paymentForm.payoutMethod === "TRC20"
          ? {
              payoutMethod: "TRC20" as const,
              trc20Address: paymentForm.trc20Address.trim(),
            }
          : {
              payoutMethod: "MOBILE_MONEY" as const,
              mobileMoneyProvider: paymentForm.mobileMoneyProvider.trim(),
              mobileMoneyNumber: paymentForm.mobileMoneyNumber.trim(),
              mobileMoneyAccountName:
                paymentForm.mobileMoneyAccountName.trim() || undefined,
            };
      const updated = await api.users.updatePaymentDetails(payload);
      setSettings(updated);
      setMessage("Payout details saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payout details");
    } finally {
      setPaymentSaving(false);
    }
  }

  async function saveTradingAccount() {
    setTradingSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.users.updateTradingAccount(
        tradingAccountId.trim() || null,
      );
      setSettings(updated);
      setTradingAccountId(updated.user.metaApiAccountId ?? "");
      setMessage("Trading account saved");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save trading account",
      );
    } finally {
      setTradingSaving(false);
    }
  }

  async function retryKyc() {
    setKycRetrying(true);
    setError("");
    setMessage("");
    try {
      const previousReason = settings?.kyc?.rejectionReason ?? "";
      const kyc = await api.users.retryKyc();
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              kyc: {
                ...kyc,
                rejectionReason: previousReason || kyc.rejectionReason,
              },
            }
          : prev,
      );
      setKycForm({
        documentType: "PASSPORT",
        documentNumber: "",
        documentFrontUrl: "",
        documentBackUrl: "",
        selfieUrl: "",
      });
      setMessage("Upload new document photos below, then resubmit for review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restart KYC");
    } finally {
      setKycRetrying(false);
    }
  }

  async function submitKyc() {
    setKycSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (!kycForm.documentFrontUrl || !kycForm.selfieUrl) {
        throw new Error("Upload document front and selfie photos");
      }
      const kyc = await api.users.submitKyc({
        documentType: kycForm.documentType,
        documentNumber: kycForm.documentNumber,
        documentFrontUrl: kycForm.documentFrontUrl,
        documentBackUrl: kycForm.documentBackUrl || undefined,
        selfieUrl: kycForm.selfieUrl,
      });
      setSettings((prev) => (prev ? { ...prev, kyc } : prev));
      setMessage("KYC submitted for review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC submission failed");
    } finally {
      setKycSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const kycStatus = settings?.kyc?.status ?? "NOT_STARTED";
  const kycMeta = KYC_STATUS[kycStatus];
  const KycIcon = kycMeta.icon;
  const kycLocked = kycStatus === "PENDING" || kycStatus === "APPROVED";
  const kycRejectionReason = settings?.kyc?.rejectionReason;
  const canRetryKyc = kycStatus === "REJECTED";
  const showKycResubmit =
    !kycLocked &&
    (kycStatus === "NOT_STARTED" || kycStatus === "REJECTED") &&
    Boolean(kycRejectionReason);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your profile, address, identity verification, and preferences.
        </p>
      </motion.div>

      {(error || message) && (
        <div
          className={cn(
            "mb-6 rounded-lg border p-3 text-sm",
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success",
          )}
        >
          {error || message}
        </div>
      )}

      <div className="space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>Profile</CardTitle>
            </div>
            <CardDescription>Your public trader identity and contact info.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={settings?.user.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={profileForm.displayName}
                maxLength={40}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, displayName: e.target.value })
                }
              />
              <p className="text-xs text-gray-500">
                Reserved names (admin, platform, support, etc.) are not allowed.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={profileForm.firstName}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={profileForm.lastName}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, lastName: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profileForm.phone}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, phone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={profileForm.dateOfBirth}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, dateOfBirth: e.target.value })
                  }
                />
              </div>
            </div>
            <Button onClick={() => void saveProfile()} disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle>Address</CardTitle>
            </div>
            <CardDescription>Required when you submit KYC for payouts — not needed to trade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={addressForm.country}
                  onChange={(e) =>
                    setAddressForm({ ...addressForm, country: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State / Region</Label>
                <Input
                  id="state"
                  value={addressForm.state}
                  onChange={(e) =>
                    setAddressForm({ ...addressForm, state: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={addressForm.city}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, city: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address1">Address line 1</Label>
              <Input
                id="address1"
                value={addressForm.addressLine1}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, addressLine1: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address2">Address line 2 (optional)</Label>
              <Input
                id="address2"
                value={addressForm.addressLine2}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, addressLine2: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal">Postal code</Label>
              <Input
                id="postal"
                value={addressForm.postalCode}
                onChange={(e) =>
                  setAddressForm({ ...addressForm, postalCode: e.target.value })
                }
              />
            </div>
            <Button onClick={() => void saveAddress()} disabled={saving}>
              {saving ? "Saving..." : "Save address"}
            </Button>
          </CardContent>
        </Card>

        {/* Payout details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <CardTitle>Payout details</CardTitle>
            </div>
            <CardDescription>
              Choose how you receive weekly payouts — USDT on TRC20 or mobile money.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["TRC20", "USDT (TRC20)"],
                  ["MOBILE_MONEY", "Mobile money"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={paymentForm.payoutMethod === value ? "default" : "secondary"}
                  onClick={() =>
                    setPaymentForm({ ...paymentForm, payoutMethod: value })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>

            {paymentForm.payoutMethod === "TRC20" ? (
              <div className="space-y-2">
                <Label htmlFor="trc20">USDT TRC20 wallet address</Label>
                <Input
                  id="trc20"
                  placeholder="T..."
                  value={paymentForm.trc20Address}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, trc20Address: e.target.value })
                  }
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Tron network address — 34 characters starting with T.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mmProvider">Provider</Label>
                  <Input
                    id="mmProvider"
                    placeholder="e.g. MTN, M-Pesa, Airtel Money"
                    value={paymentForm.mobileMoneyProvider}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        mobileMoneyProvider: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mmNumber">Mobile money number</Label>
                  <Input
                    id="mmNumber"
                    placeholder="+256..."
                    value={paymentForm.mobileMoneyNumber}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        mobileMoneyNumber: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mmName">Account name (optional)</Label>
                  <Input
                    id="mmName"
                    value={paymentForm.mobileMoneyAccountName}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        mobileMoneyAccountName: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}

            <Button onClick={() => void savePaymentDetails()} disabled={paymentSaving}>
              {paymentSaving ? "Saving..." : "Save payout details"}
            </Button>
          </CardContent>
        </Card>

        {/* KYC */}
        <Card id="kyc">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Identity verification (KYC)</CardTitle>
              </div>
              <Badge variant={kycMeta.variant} className="gap-1">
                <KycIcon className="h-3 w-3" />
                {kycMeta.label}
              </Badge>
            </div>
            <CardDescription>
              Required before you can request a payout. You can pay registration and submit
              setups without completing this step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kycRejectionReason && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                <p className="font-medium">Previous submission rejected</p>
                <p className="mt-1">{kycRejectionReason}</p>
                {canRetryKyc && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    disabled={kycRetrying}
                    onClick={() => void retryKyc()}
                  >
                    {kycRetrying ? "Preparing..." : "Upload new documents"}
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Document type</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["PASSPORT", "Passport"],
                    ["NATIONAL_ID", "National ID"],
                    ["DRIVERS_LICENSE", "Driver's license"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={kycForm.documentType === value ? "default" : "secondary"}
                    disabled={kycLocked}
                    onClick={() =>
                      setKycForm({ ...kycForm, documentType: value })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="docNumber">Document number</Label>
              <Input
                id="docNumber"
                value={kycForm.documentNumber}
                disabled={kycLocked}
                onChange={(e) =>
                  setKycForm({ ...kycForm, documentNumber: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <KycUploadField
                label="Document front"
                url={kycForm.documentFrontUrl}
                disabled={kycLocked}
                onUpload={(url) =>
                  setKycForm({ ...kycForm, documentFrontUrl: url })
                }
                onClear={() =>
                  setKycForm({ ...kycForm, documentFrontUrl: "" })
                }
              />
              <KycUploadField
                label="Document back (optional)"
                url={kycForm.documentBackUrl}
                disabled={kycLocked}
                onUpload={(url) =>
                  setKycForm({ ...kycForm, documentBackUrl: url })
                }
                onClear={() =>
                  setKycForm({ ...kycForm, documentBackUrl: "" })
                }
              />
            </div>

            <KycUploadField
              label="Selfie with document"
              url={kycForm.selfieUrl}
              disabled={kycLocked}
              onUpload={(url) => setKycForm({ ...kycForm, selfieUrl: url })}
              onClear={() => setKycForm({ ...kycForm, selfieUrl: "" })}
            />

            {!kycLocked && (
              <Button
                onClick={() => void submitKyc()}
                disabled={kycSubmitting}
                className="w-full"
              >
                {kycSubmitting
                  ? "Submitting..."
                  : showKycResubmit
                    ? "Resubmit for verification"
                    : "Submit for verification"}
              </Button>
            )}

            {kycStatus === "APPROVED" && (
              <p className="text-sm text-success">
                Your identity has been verified. No further action needed.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Live trading account</CardTitle>
            </div>
            <CardDescription>
              Link your MT4/MT5 trading account to place trades from submitted
              setups at market price with your SL and TP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!settings?.metaApi?.configured ? (
              <p className="text-sm text-muted">
                Live trading is not enabled on this platform yet.
              </p>
            ) : metaApiAccounts.length === 0 ? (
              <p className="text-sm text-muted">
                No connected trading accounts found. Contact your administrator
                to link a broker account.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="metaApiAccount">Connected account</Label>
                  <select
                    id="metaApiAccount"
                    value={tradingAccountId}
                    onChange={(e) => setTradingAccountId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">
                      {settings.metaApi?.defaultAccountId
                        ? "Use platform default account"
                        : "Select an account…"}
                    </option>
                    {metaApiAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || a.login} · {a.server} · {a.connectionStatus}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  onClick={() => void saveTradingAccount()}
                  disabled={tradingSaving}
                >
                  {tradingSaving ? "Saving…" : "Save trading account"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Referral program */}
        <ReferralCard />

        {/* Account */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-primary" />
              )}
              <CardTitle>Account</CardTitle>
            </div>
            <CardDescription>
              Member since{" "}
              {settings?.user.createdAt
                ? new Date(settings.user.createdAt).toLocaleDateString()
                : "—"}
              {" · "}
              Tier: {settings?.user.tier ?? "BRONZE"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Appearance</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={theme === "dark" ? "default" : "secondary"}
                  className="flex-1 gap-2"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </Button>
                <Button
                  type="button"
                  variant={theme === "light" ? "default" : "secondary"}
                  className="flex-1 gap-2"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </Button>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full gap-2 text-danger hover:text-danger"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
