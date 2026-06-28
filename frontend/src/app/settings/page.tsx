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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { api, type UserSettings, type KycRecord } from "@/lib/api";
import { validateDisplayName } from "@/lib/display-name";
import { cn } from "@/lib/utils";
import { AuthenticatedImage } from "@/components/ui/authenticated-image";

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
  disabled,
}: {
  label: string;
  url: string;
  onUpload: (url: string) => void;
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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute bottom-2 right-2"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
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
  const { isAuthenticated, logout, setAuth, token } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<UserSettings | null>(null);

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

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    void loadSettings();
  }, [isAuthenticated, router]);

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

        {/* KYC */}
        <Card>
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
            {kycStatus === "REJECTED" && settings?.kyc?.rejectionReason && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                Rejected: {settings.kyc.rejectionReason}. Please resubmit.
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
              />
              <KycUploadField
                label="Document back (optional)"
                url={kycForm.documentBackUrl}
                disabled={kycLocked}
                onUpload={(url) =>
                  setKycForm({ ...kycForm, documentBackUrl: url })
                }
              />
            </div>

            <KycUploadField
              label="Selfie with document"
              url={kycForm.selfieUrl}
              disabled={kycLocked}
              onUpload={(url) => setKycForm({ ...kycForm, selfieUrl: url })}
            />

            {!kycLocked && (
              <Button
                onClick={() => void submitKyc()}
                disabled={kycSubmitting}
                className="w-full"
              >
                {kycSubmitting ? "Submitting..." : "Submit for verification"}
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
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-primary" />
              )}
              <CardTitle>Appearance</CardTitle>
            </div>
            <CardDescription>Choose your preferred theme.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Member since{" "}
              {settings?.user.createdAt
                ? new Date(settings.user.createdAt).toLocaleDateString()
                : "—"}
              {" · "}
              Tier: {settings?.user.tier ?? "BRONZE"}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
