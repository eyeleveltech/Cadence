"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { verifyInviteToken, setPasswordWithInviteToken } from "@/lib/actions/team";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Lock, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F7]">
          <Loader2 className="size-6 animate-spin text-[var(--ink3)]" />
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}

const DARK_BUTTON =
  "w-full bg-[#211D1A] text-white hover:bg-[#332E29] focus-visible:ring-[#211D1A]/30";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userInfo, setUserInfo] = useState<{ name?: string; email?: string } | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setLoading(false);
      return;
    }

    let isMounted = true;
    verifyInviteToken(token)
      .then((res) => {
        if (!isMounted) return;
        if (res.valid) {
          setTokenValid(true);
          setUserInfo({ name: res.name, email: res.email });
        } else {
          setTokenValid(false);
        }
      })
      .catch(() => {
        if (isMounted) setTokenValid(false);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (password.length < 10) {
      toast.error("Password must be at least 10 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await setPasswordWithInviteToken({ token, newPassword: password });
      setSuccess(true);
      toast.success("Password set successfully! Signing you in…");

      // Auto sign-in with the user's newly set password
      const signInEmail = res.email ?? userInfo?.email ?? "";
      if (signInEmail) {
        const { error: signInError } = await authClient.signIn.email({
          email: signInEmail,
          password,
        });

        if (!signInError) {
          router.push("/planner");
          router.refresh();
          return;
        }
      }

      // If auto-signin fails for any network reason, redirect to login
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(signInEmail)}`);
      }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't set password. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden w-1/2 shrink-0 flex-col justify-between bg-[#211D1A] p-12 text-white lg:flex">
        <div className="text-lg font-semibold tracking-tight">Cadence</div>

        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-balance">
            One shared rhythm for every client&apos;s content.
          </h1>
          <p className="text-white/60">
            Plan the month, hand off creatives, keep the copy moving and get client sign-off — without another spreadsheet.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>Internal agency workspace</span>
          <span>·</span>
          <Link href="/login" className="underline underline-offset-2 hover:text-white/70">
            Already have an account? Sign in
          </Link>
        </div>
      </div>

      {/* Main content panel */}
      <div className="flex flex-1 items-center justify-center bg-[#FAF9F7] px-6 py-12">
        <div className="w-full max-w-[448px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="size-8 animate-spin text-[var(--ink3)]" />
              <p className="mt-4 text-sm text-[var(--ink3)]">Verifying your invite link…</p>
            </div>
          ) : !tokenValid ? (
            <div className="space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
              <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertCircle className="size-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Invalid or Expired Link
                </h2>
                <p className="text-sm leading-relaxed text-[var(--ink3)]">
                  This activation link is either invalid, expired, or has already been used to set a password.
                </p>
                <p className="text-sm leading-relaxed text-[var(--ink3)]">
                  Please ask your Cadence administrator to send you a new invitation link.
                </p>
              </div>
              <div className="pt-2">
                <Button render={<Link href="/login" />} size="lg" className={DARK_BUTTON}>
                  Return to Sign In <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          ) : success ? (
            <div className="space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Password Set!
                </h2>
                <p className="text-sm leading-relaxed text-[var(--ink3)]">
                  Your password has been configured and your account is active. Taking you to your workspace…
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--ink3)]">
                <Loader2 className="size-4 animate-spin" /> Redirecting to Cadence…
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F7] px-3 py-1 text-xs font-medium text-[var(--ink3)] border border-border mb-3">
                  <Lock className="size-3" /> Account Setup
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Welcome to Cadence{userInfo?.name ? `, ${userInfo.name}` : ""}
                </h2>
                <p className="mt-1 text-sm text-[var(--ink3)]">
                  {userInfo?.email ? (
                    <>Setting up access for <strong className="font-semibold text-foreground">{userInfo.email}</strong></>
                  ) : (
                    "Choose a secure password to activate your account."
                  )}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={10}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-10"
                      placeholder="At least 10 characters"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink3)] hover:text-foreground focus:outline-none transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-[var(--ink4)]">Must be at least 10 characters long.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      minLength={10}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11 pr-10"
                      placeholder="Repeat your new password"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink3)] hover:text-foreground focus:outline-none transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className={DARK_BUTTON}
                  disabled={submitting || password.length < 10 || password !== confirmPassword}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Setting Password…
                    </>
                  ) : (
                    "Set Password & Sign In"
                  )}
                </Button>
              </form>

              <p className="text-center text-xs text-[var(--ink4)]">
                By setting up your account, you agree to agency security guidelines.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
