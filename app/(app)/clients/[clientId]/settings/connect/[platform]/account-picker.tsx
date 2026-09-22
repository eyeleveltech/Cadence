"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, Check } from "lucide-react";
import { chooseSocialAccount, cancelPendingConnection } from "@/lib/actions/social-accounts";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { toast } from "sonner";

type Choice = {
  externalAccountId: string;
  accountName: string;
  avatarUrl: string | null;
  /** Already connected to a different client — nearly always a mistake. */
  takenByClient: string | null;
};

export function AccountPicker({
  clientId, platform, accounts,
}: {
  clientId: string;
  platform: string;
  accounts: Choice[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    if (!selected) return;
    setBusy(true);
    try {
      await chooseSocialAccount({ clientId, platform, externalAccountId: selected });
      toast.success("Connected");
      router.push(`/clients/${clientId}/settings?oauth_success=1&platform=${platform}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't connect that account");
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    // Clears the stored token rather than leaving it to expire on its own.
    await cancelPendingConnection(clientId).catch(() => {});
    router.push(`/clients/${clientId}/settings`);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {accounts.map((account) => {
          const active = selected === account.externalAccountId;
          return (
            <button
              key={account.externalAccountId}
              onClick={() => !account.takenByClient && setSelected(account.externalAccountId)}
              // An account already bound to another client is refused by a
              // database constraint now, so don't offer it.
              disabled={Boolean(account.takenByClient)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                account.takenByClient
                  ? "cursor-not-allowed border-border bg-[var(--fill)] opacity-60"
                  : active
                    ? "border-[var(--ink4)] bg-[var(--accent-soft)]"
                    : "border-border bg-card hover:border-[var(--ink4)]",
              )}
            >
              {account.avatarUrl ? (
                <Image
                  src={account.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  className="size-9 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--fill)] text-xs font-semibold text-[var(--ink3)]">
                  {account.accountName.replace(/^@/, "").slice(0, 2).toUpperCase()}
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{account.accountName}</span>
                {account.takenByClient && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-[var(--status-warn)]">
                    <AlertTriangle className="size-3" />
                    Already connected to {account.takenByClient} — disconnect it there first
                  </span>
                )}
              </span>

              {active && <Check className="size-4 shrink-0 text-[var(--ink2)]" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleConnect} disabled={!selected || busy}>
          {busy ? "Connecting…" : "Connect this account"}
        </Button>
        <Button variant="outline" onClick={handleCancel} disabled={busy}>
          Cancel
        </Button>
      </div>

      <p className="text-xs text-[var(--ink3)]">
        Can&apos;t see the right account? It has to be shared with EyeLevel&apos;s business and assigned to
        whoever just signed in. For Instagram it also has to be a professional account linked to a Facebook Page.
      </p>
    </div>
  );
}
