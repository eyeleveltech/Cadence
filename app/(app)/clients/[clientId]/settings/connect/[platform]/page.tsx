import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getOAuthAdapter, isPlatformSlug, SLUG_TO_PLATFORM } from "@/lib/social/oauth";
import { readPendingConnection } from "@/lib/social/pending-connection";
import { AccountPicker } from "./account-picker";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

/**
 * Shown only when the authorizing login administers more than one asset.
 * With Business Manager partner access that's the normal case for an
 * agency — one login, every client's Page — so this is the screen that
 * stops a client's posts being bound to another client's account.
 */
export default async function ConnectPickerPage({
  params,
}: {
  params: Promise<{ clientId: string; platform: string }>;
}) {
  const { clientId, platform } = await params;
  if (!isPlatformSlug(platform)) notFound();

  await requireRole("ADMIN", "MANAGER");

  const pending = await readPendingConnection();
  // Nothing in hand — either it expired or someone navigated here
  // directly. Send them back to start the connect properly.
  if (!pending || pending.clientId !== clientId || pending.platform !== platform) {
    redirect(`/clients/${clientId}/settings?oauth_error=expired&platform=${platform}`);
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true },
  });
  if (!client) notFound();

  let accounts;
  try {
    accounts = await getOAuthAdapter(platform).listAccounts({
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      expiresAt: pending.expiresAt ? new Date(pending.expiresAt) : undefined,
    });
  } catch {
    redirect(`/clients/${clientId}/settings?oauth_error=failed&platform=${platform}`);
  }

  // Flag anything already attached to a different client — connecting the
  // same Page to two clients is legal in the schema and almost always a
  // mistake in practice.
  const elsewhere = await prisma.socialAccount.findMany({
    where: {
      platform: SLUG_TO_PLATFORM[platform],
      externalAccountId: { in: accounts.map((a) => a.externalAccountId) },
      clientId: { not: clientId },
    },
    select: { externalAccountId: true, client: { select: { name: true } } },
  });
  const takenBy = new Map(elsewhere.map((a) => [a.externalAccountId, a.client.name]));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Which {PLATFORM_LABEL[platform]} account is {client.name}&apos;s?
        </h1>
        <p className="mt-1 text-sm text-[var(--ink3)]">
          This login can reach {accounts.length} accounts. Pick the one that belongs to this client —
          everything Cadence publishes for {client.name} will go to it.
        </p>
      </div>

      <AccountPicker
        clientId={clientId}
        platform={platform}
        accounts={accounts.map((a) => ({
          externalAccountId: a.externalAccountId,
          accountName: a.accountName,
          avatarUrl: a.avatarUrl ?? null,
          takenByClient: takenBy.get(a.externalAccountId) ?? null,
        }))}
      />
    </div>
  );
}
