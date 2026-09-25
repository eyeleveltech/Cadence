"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Platform, ConnectionStatus, TokenType } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/social/health";

/**
 * Only the columns the settings page actually sends. Deliberately not
 * the whole SocialAccount row — anything in this type crosses to the
 * browser, and that row carries the stored platform tokens.
 */
export type ConnectedAccountSummary = {
  id: string;
  platform: Platform;
  accountName: string;
  avatarUrl: string | null;
  connectionStatus: ConnectionStatus;
  /** Why it's unhealthy, in the platform's words — an expired token and a
   * withdrawn permission need different things done about them. */
  statusDetail: string | null;
  tokenType: TokenType;
  lastHealthCheckAt: Date | null;
  scopes: string[];
};
import { disconnectSocialAccount, connectSandboxSocialAccount } from "@/lib/actions/social-accounts";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn", YOUTUBE: "YouTube", TWITTER: "Twitter",
};
/**
 * How each platform can be connected. Instagram has two routes, because
 * Meta provides two and which one works depends on the client: an
 * account linked to a Facebook Page can use either, one without a Page
 * can only use the direct Instagram login.
 */
const CONNECT_ROUTES: Record<Platform, { slug: string; label: string; hint: string }[]> = {
  INSTAGRAM: [
    {
      slug: "instagram-direct",
      label: "Instagram login",
      hint: "The client signs in with Instagram. No Facebook Page needed.",
    },
    {
      slug: "instagram",
      label: "Through a Facebook Page",
      hint: "For an Instagram account linked to a Page you have access to.",
    },
  ],
  FACEBOOK: [{ slug: "facebook", label: "Connect", hint: "" }],
  LINKEDIN: [{ slug: "linkedin", label: "Connect", hint: "" }],
  YOUTUBE: [{ slug: "youtube", label: "Connect", hint: "" }],
  TWITTER: [{ slug: "twitter", label: "Connect", hint: "" }],
};
const PLATFORMS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE", "TWITTER"] as const satisfies readonly Platform[];

export function ConnectedAccounts({
  clientId,
  accounts,
  configured,
  isLeadership,
}: {
  clientId: string;
  accounts: ConnectedAccountSummary[];
  configured: Record<string, boolean>;
  isLeadership: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get("oauth_success");
    const error = searchParams.get("oauth_error");
    const platform = searchParams.get("platform");
    if (!success && !error) return;

    if (success) toast.success(`${platform} connected`);
    else if (error === "not_configured") toast.error(`${platform} isn't configured yet — add its API credentials to .env first.`);
    else if (error === "denied") toast.error(`${platform} connection was cancelled.`);
    else if (error === "no_accounts") toast.error(`That login doesn't administer any ${platform} account we can publish to.`);
    else if (error === "expired") toast.error("That connection attempt timed out — try connecting again.");
    else toast.error(`Couldn't connect ${platform} — see server logs.`);

    router.replace(`/clients/${clientId}/settings`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {PLATFORMS.map((platform) => {
        const account = accounts.find((a) => a.platform === platform);
        const connected = account?.connectionStatus === "CONNECTED";

        return (
          <div key={platform} className="flex items-center justify-between rounded-xl border border-border p-3.5">
            <span className="text-sm font-medium">{PLATFORM_LABEL[platform]}</span>

            <div className="flex items-center gap-2">
              <span
                className={
                  connected ? "om-pill om-pill-solid"
                    : account ? "om-pill om-pill-warn"
                      : "om-pill"
                }
                title={account?.statusDetail ?? undefined}
              >
                {account ? STATUS_LABEL[account.connectionStatus] : "Not connected"}
              </span>

              {account ? (
                <ManageDialog
                  clientId={clientId}
                  account={account}
                  label={PLATFORM_LABEL[platform]}
                  isLeadership={isLeadership}
                  onChanged={() => router.refresh()}
                />
              ) : (
                <ConnectControl
                  clientId={clientId}
                  platform={platform}
                  routes={CONNECT_ROUTES[platform]}
                  configured={configured}
                  isLeadership={isLeadership}
                />
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Cadence doesn&apos;t publish directly yet — this shows each account&apos;s connection status. Full publishing
        needs Meta App Review, LinkedIn Community Management vetting and Google verification to clear.
      </p>
    </div>
  );
}

/**
 * One button when a platform has a single way in, a menu when it has
 * more than one. Each route is enabled independently, since Instagram's
 * two paths use different credentials.
 */
function ConnectControl({
  clientId, platform, routes, configured, isLeadership,
}: {
  clientId: string;
  platform: Platform;
  routes: { slug: string; label: string; hint: string }[];
  configured: Record<string, boolean>;
  isLeadership: boolean;
}) {
  const router = useRouter();
  const [connectingSandbox, setConnectingSandbox] = useState(false);
  const available = routes.filter((r) => configured[r.slug]);

  async function handleConnectSandbox() {
    setConnectingSandbox(true);
    try {
      await connectSandboxSocialAccount(clientId, platform);
      toast.success(`Sandbox ${PLATFORM_LABEL[platform]} account connected!`);
      router.refresh();
    } catch {
      toast.error("Couldn't connect sandbox account");
    } finally {
      setConnectingSandbox(false);
    }
  }

  if (!isLeadership) {
    return (
      <Button size="sm" variant="outline" disabled title="Only an admin or manager can connect accounts">
        Connect
      </Button>
    );
  }

  if (available.length === 0) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleConnectSandbox}
        disabled={connectingSandbox}
        title="Connect sandbox mock account for testing"
      >
        {connectingSandbox ? "Connecting…" : "Connect Sandbox"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="sm" variant="outline">Connect <ChevronDown className="size-3.5" /></Button>}
      />
      <DropdownMenuContent align="end" className="w-72">
        {available.map((route) => (
          <DropdownMenuItem
            key={route.slug}
            nativeButton={false}
            render={<a href={`/api/oauth/${route.slug}/connect?clientId=${clientId}`} />}
            className="flex w-full flex-col items-start gap-0.5"
          >
            <span className="text-sm font-medium">{route.label}</span>
            <span className="text-xs text-[var(--ink3)]">{route.hint}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={handleConnectSandbox}
          disabled={connectingSandbox}
          className="flex w-full flex-col items-start gap-0.5 border-t border-border mt-1 pt-1.5"
        >
          <span className="text-sm font-medium text-primary">🧪 Connect Sandbox Account</span>
          <span className="text-xs text-[var(--ink3)]">Test publishing immediately in simulation mode</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ManageDialog({
  clientId, account, label, isLeadership, onChanged,
}: {
  clientId: string;
  account: ConnectedAccountSummary;
  label: string;
  isLeadership: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDisconnect() {
    if (!window.confirm(`Disconnect ${label}? Scheduled posts to it will fail until it's reconnected.`)) return;
    setBusy(true);
    try {
      await disconnectSocialAccount({ clientId, accountId: account.id });
      toast.success("Disconnected");
      setOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline">Manage</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Connected as <span className="font-medium text-foreground">{account.accountName}</span>.
        </p>
        {isLeadership && (
          <DialogFooter>
            <Button variant="destructive" onClick={handleDisconnect} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
