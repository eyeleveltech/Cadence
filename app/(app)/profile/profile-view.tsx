"use client";

import { useState } from "react";
import { ROLE_LABELS } from "@/lib/roles";
import { changeCurrentUserPassword, sendPasswordResetForCurrentUser } from "@/lib/actions/team";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ProfileViewProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt?: Date | string;
  };
}

const DARK_BUTTON =
  "bg-[#211D1A] text-white hover:bg-[#332E29] focus-visible:ring-[#211D1A]/30";

export function ProfileView({ user }: ProfileViewProps) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatedSuccess, setUpdatedSuccess] = useState(false);

  // Reset link states
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();

    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }

    if (newPassword.length < 10) {
      toast.error("New password must be at least 10 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setUpdating(true);
    setUpdatedSuccess(false);
    try {
      await changeCurrentUserPassword({ currentPassword, newPassword });
      toast.success("Password updated successfully!");
      setUpdatedSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setUpdatedSuccess(false), 5000);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password. Check your current password.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleSendResetLink() {
    setSendingReset(true);
    try {
      await sendPasswordResetForCurrentUser();
      setResetSent(true);
      toast.success(`Password reset link sent to ${user.email}!`);
      setTimeout(() => setResetSent(false), 60000);
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset link.");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Profile Overview Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar className="size-16 border border-border bg-[#FAF9F7]">
            <AvatarFallback className="text-xl font-bold text-[var(--ink2)]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">{user.name}</h2>
              <span className="om-pill text-xs">
                {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
              </span>
            </div>
            <p className="om-mono text-sm text-[var(--ink3)]">{user.email}</p>
            <p className="text-xs text-[var(--ink4)]">EyeLevel Growth Studio · Cadence Workspace</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        {/* Change Password Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#FAF9F7] border border-border text-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Change Password</h3>
              <p className="text-xs text-[var(--ink3)]">Update your login password securely.</p>
            </div>
          </div>

          {updatedSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>Your password has been updated successfully.</span>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="page-current-pw" className="text-xs font-medium">Current Password</Label>
              <div className="relative">
                <Input
                  id="page-current-pw"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-10 pr-10 text-sm"
                  placeholder="Enter current password"
                  disabled={updating}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink3)] hover:text-foreground focus:outline-none"
                  tabIndex={-1}
                  aria-label={showCurrent ? "Hide password" : "Show password"}
                >
                  {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="page-new-pw" className="text-xs font-medium">New Password</Label>
              <div className="relative">
                <Input
                  id="page-new-pw"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 pr-10 text-sm"
                  placeholder="At least 10 characters"
                  disabled={updating}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink3)] hover:text-foreground focus:outline-none"
                  tabIndex={-1}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-[var(--ink4)]">Must be 10 or more characters.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="page-confirm-pw" className="text-xs font-medium">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="page-confirm-pw"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 pr-10 text-sm"
                  placeholder="Repeat new password"
                  disabled={updating}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink3)] hover:text-foreground focus:outline-none"
                  tabIndex={-1}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                className={DARK_BUTTON}
                disabled={updating || !currentPassword || newPassword.length < 10 || newPassword !== confirmPassword}
              >
                {updating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Saving Password…
                  </>
                ) : (
                  "Save New Password"
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Forgot Password / Reset Section */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#FAF9F7] border border-border text-foreground">
                <Mail className="size-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Forgot Password?</h3>
                <p className="text-xs text-[var(--ink3)]">Email-based password reset</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[var(--ink3)]">
              Can&apos;t remember your current password? We can send a secure, one-click reset link straight to your registered work email:
            </p>

            <div className="rounded-xl border border-border bg-[#FAF9F7] p-3 om-mono text-xs text-[var(--ink2)] font-medium">
              {user.email}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full text-xs font-medium"
              onClick={handleSendResetLink}
              disabled={sendingReset || resetSent}
            >
              {sendingReset ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" /> Sending email…
                </>
              ) : resetSent ? (
                "Reset Link Sent ✓ (Check Email)"
              ) : (
                "Send Password Reset Link"
              )}
            </Button>
            {resetSent && (
              <p className="text-[11px] text-emerald-600">
                Check your inbox for the activation link to set your new password.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
              <ShieldCheck className="size-4 text-emerald-600" />
              Account Protection
            </div>
            <p className="text-xs leading-relaxed text-[var(--ink3)]">
              Your account password is encrypted and stored safely. Passwords must be at least 10 characters long.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
