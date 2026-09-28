"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { requestForgotPassword } from "@/lib/actions/team";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const DARK_BUTTON =
  "w-full bg-[#211D1A] text-white hover:bg-[#332E29] focus-visible:ring-[#211D1A]/30";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/planner";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password dialog state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    try {
      await requestForgotPassword(forgotEmail.trim());
      setForgotSent(true);
      toast.success("If an account exists, a password reset link has been emailed!");
    } catch {
      toast.error("Could not send reset link. Please try again.");
    } finally {
      setForgotSending(false);
    }
  }

  async function handleTeamLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Couldn't sign in — check your email and password.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.magicLink({
      email: magicEmail,
      callbackURL: next,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Couldn't send the link.");
      return;
    }
    setMagicSent(true);
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel — hidden on small screens, the form alone is what matters there. */}
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
          <Link href="/demo" className="underline underline-offset-2 hover:text-white/70">
            Just want to look around? View the demo
          </Link>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-1 items-center justify-center bg-[#FAF9F7] px-6 py-12">
        <div className="w-full max-w-[448px]">
          <Tabs defaultValue="team" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-lg border border-border bg-muted p-1">
              <TabsTrigger value="team" className="rounded-md text-sm font-medium text-[var(--ink3)] data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(21,22,23,0.06)]">
                Team
              </TabsTrigger>
              <TabsTrigger value="client" className="rounded-md text-sm font-medium text-[var(--ink3)] data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(21,22,23,0.06)]">
                Client reviewer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="team" className="pt-6">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h2>
                <p className="mt-1 text-sm text-[var(--ink3)]">Writers, designers, managers and admins.</p>
              </div>
              <form onSubmit={handleTeamLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                    placeholder="you@eyelevelstudio.in"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotSent(false);
                        setForgotOpen(true);
                      }}
                      className="text-xs text-[var(--ink3)] hover:text-foreground hover:underline transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-10"
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
                </div>
                <Button type="submit" size="lg" className={DARK_BUTTON} disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-[var(--ink3)]">
                Need access? Ask an admin to invite you.
              </p>
            </TabsContent>

            <TabsContent value="client" className="pt-6">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h2>
                <p className="mt-1 text-sm text-[var(--ink3)]">Review and approve content for your brand.</p>
              </div>
              {magicSent ? (
                <p className="rounded-lg border border-border bg-muted p-3 text-sm text-[var(--ink2)]">
                  Check your email for a sign-in link — it expires in 15 minutes.
                </p>
              ) : (
                <>
                  <form onSubmit={handleMagicLink} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="magic-email" className="text-sm font-medium">Work email</Label>
                      <Input
                        id="magic-email"
                        type="email"
                        required
                        value={magicEmail}
                        onChange={(e) => setMagicEmail(e.target.value)}
                        className="h-11"
                        placeholder="the email your account manager used"
                      />
                    </div>
                    <Button type="submit" size="lg" className={DARK_BUTTON} disabled={loading}>
                      {loading ? "Sending…" : "Email me a sign-in link"}
                    </Button>
                  </form>
                  <p className="mt-5 text-center text-sm text-[var(--ink3)]">
                    Need access? Ask your account manager to invite you.
                  </p>
                </>
              )}
            </TabsContent>
          </Tabs>

          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogContent className="max-w-[420px] p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <KeyRound className="size-5 text-[var(--ink2)]" />
                  Reset Your Password
                </DialogTitle>
              </DialogHeader>

              {forgotSent ? (
                <div className="space-y-4 py-2">
                  <div className="rounded-xl border border-border bg-[#FAF9F7] p-4 text-sm text-[var(--ink2)]">
                    <p className="font-semibold text-foreground">Check your email</p>
                    <p className="mt-1 text-xs text-[var(--ink3)]">
                      If an account exists for <strong>{forgotEmail}</strong>, we have sent a secure link to reset your password. The link is valid for 7 days.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className={DARK_BUTTON}
                    onClick={() => setForgotOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4 pt-2">
                  <p className="text-xs leading-relaxed text-[var(--ink3)]">
                    Enter the work email address associated with your Cadence account. We&apos;ll send you a link to reset your password.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-xs font-medium">Work email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@eyelevelstudio.in"
                      className="h-10"
                      disabled={forgotSending}
                    />
                  </div>
                  <Button
                    type="submit"
                    className={DARK_BUTTON}
                    disabled={forgotSending || !forgotEmail.trim()}
                  >
                    {forgotSending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Sending link…
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
