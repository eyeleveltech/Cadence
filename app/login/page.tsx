"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState(false);

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
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
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
        </div>
      </div>
    </div>
  );
}
