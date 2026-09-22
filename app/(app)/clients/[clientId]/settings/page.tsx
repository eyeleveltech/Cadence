import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess } from "@/lib/session";
import { listAllUsers } from "@/lib/actions/team";
import { getOAuthAdapter } from "@/lib/social/oauth";
import { ClientTeam } from "./client-team";
import { ConnectedAccounts } from "./connected-accounts";
import { BrandKit } from "./brand-kit";
import { ClientAdmin } from "./client-admin";

// Keyed by connect *route*, not by platform: Instagram has two of them
// and they use different credentials, so one can be live while the other
// isn't.
const CONFIGURED: Record<string, boolean> = {
  instagram: getOAuthAdapter("instagram").isConfigured(),
  "instagram-direct": getOAuthAdapter("instagram-direct").isConfigured(),
  facebook: getOAuthAdapter("facebook").isConfigured(),
  linkedin: getOAuthAdapter("linkedin").isConfigured(),
  youtube: getOAuthAdapter("youtube").isConfigured(),
};

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const currentUser = await requireClientWorkspaceAccess(clientId);
  const isLeadership = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";

  const [client, members, accounts, orgUsers] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.clientMember.findMany({
      where: { clientId },
      include: { user: { select: { name: true, email: true, role: true } } },
    }),
    // Explicit select, not the whole row: this is handed to a client
    // component, so every column listed here is serialized into the RSC
    // payload and shipped to the browser. accessToken and refreshToken
    // are encrypted, but they have no business leaving the server.
    prisma.socialAccount.findMany({
      where: { clientId },
      select: {
        id: true,
        platform: true,
        accountName: true,
        connectionStatus: true,
        statusDetail: true,
        tokenType: true,
        avatarUrl: true,
        lastHealthCheckAt: true,
        scopes: true,
      },
    }),
    isLeadership ? listAllUsers() : Promise.resolve([]),
  ]);

  const brandColors = Array.isArray(client.brandColors)
    ? client.brandColors.filter((c): c is string => typeof c === "string")
    : [];

  return (
    <div className="space-y-4 p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Brand kit</h2>
          <div className="mt-4">
            <BrandKit clientId={clientId} toneOfVoice={client.toneOfVoice ?? ""} brandColors={brandColors} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Connected accounts</h2>
          <div className="mt-4">
            <Suspense fallback={null}>
              <ConnectedAccounts
                clientId={clientId}
                accounts={accounts}
                configured={CONFIGURED}
                isLeadership={isLeadership}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {isLeadership && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Client status</h2>
          <div className="mt-4">
            <ClientAdmin
              clientId={clientId}
              clientName={client.name}
              status={client.status}
              isAdmin={currentUser.role === "ADMIN"}
            />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Team on this client</h2>
        <div className="mt-4">
          <ClientTeam
            clientId={clientId}
            members={members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.user.role }))}
            isLeadership={isLeadership}
            orgUsers={orgUsers}
          />
        </div>
      </div>
    </div>
  );
}
