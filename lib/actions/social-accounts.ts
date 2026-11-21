"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { encryptToken } from "@/lib/crypto";
import { getOAuthAdapter, isPlatformSlug, SLUG_TO_PLATFORM } from "@/lib/social/oauth";
import { readPendingConnection, clearPendingConnection } from "@/lib/social/pending-connection";
import type { Platform } from "@prisma/client";

const disconnectSchema = z.object({
  clientId: z.string().cuid(),
  accountId: z.string().cuid(),
});

export async function disconnectSocialAccount(input: z.infer<typeof disconnectSchema>) {
  const user = await requireRole("ADMIN", "MANAGER");
  const { clientId, accountId } = disconnectSchema.parse(input);

  const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.clientId !== clientId) throw new Error("That account doesn't belong to this client.");

  await prisma.$transaction([
    prisma.scheduledJob.deleteMany({
      where: { socialAccountId: accountId },
    }),
    prisma.socialAccount.delete({
      where: { id: accountId },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "SOCIAL_ACCOUNT_DISCONNECTED",
      entityType: "Client",
      entityId: clientId,
      metadata: { platform: account.platform, accountName: account.accountName },
    },
  });

  revalidatePath(`/clients/${clientId}/settings`);
  revalidatePath(`/clients/${clientId}/plan`);
  revalidatePath("/posts");
}

const chooseSchema = z.object({
  clientId: z.string().cuid(),
  platform: z.string(),
  externalAccountId: z.string().min(1),
});

/**
 * Finishes a connection once someone has said which asset belongs to
 * this client.
 *
 * The externalAccountId is re-resolved against a fresh listing rather
 * than trusted from the form, so a tampered id can't bind an account the
 * authorizing login never actually had access to — and so the per-asset
 * token comes from the platform, not from the browser.
 */
export async function chooseSocialAccount(input: z.infer<typeof chooseSchema>) {
  const user = await requireRole("ADMIN", "MANAGER");
  const data = chooseSchema.parse(input);
  if (!isPlatformSlug(data.platform)) throw new Error("Unknown platform.");

  const pending = await readPendingConnection();
  if (!pending) {
    throw new Error("That connection attempt expired — start the connect again.");
  }
  if (pending.clientId !== data.clientId || pending.platform !== data.platform) {
    throw new Error("That connection attempt was for a different client.");
  }

  const adapter = getOAuthAdapter(data.platform);
  const available = await adapter.listAccounts({
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    expiresAt: pending.expiresAt ? new Date(pending.expiresAt) : undefined,
  });

  const chosen = available.find((a) => a.externalAccountId === data.externalAccountId);
  if (!chosen) throw new Error("That account is no longer available on this login.");

  await saveConnectedAccount({
    clientId: data.clientId,
    platform: data.platform,
    account: chosen,
    connectedById: user.id,
    refreshToken: pending.refreshToken,
  });

  // Smart Auto-Link: If Facebook has linked Instagram, auto-link Instagram
  if (data.platform === "facebook" && chosen.linkedInstagram) {
    await saveConnectedAccount({
      clientId: data.clientId,
      platform: "instagram",
      account: {
        externalAccountId: chosen.linkedInstagram.id,
        accountName: `@${chosen.linkedInstagram.username.replace(/^@+/, "")}`,
        avatarUrl: chosen.linkedInstagram.profile_picture_url,
        scopes: ["instagram_content_publish", "instagram_basic"],
        accessToken: chosen.accessToken,
        tokenType: "PAGE",
      },
      connectedById: user.id,
    }).catch((err) => console.warn("[oauth:facebook] auto-link instagram failed:", err));
  }

  // Smart Auto-Link: If Instagram has linked Facebook Page, auto-link Facebook
  if (data.platform === "instagram" && chosen.linkedFacebookPage) {
    await saveConnectedAccount({
      clientId: data.clientId,
      platform: "facebook",
      account: {
        externalAccountId: chosen.linkedFacebookPage.id,
        accountName: chosen.linkedFacebookPage.name,
        avatarUrl: chosen.linkedFacebookPage.avatarUrl,
        scopes: ["pages_manage_posts", "pages_read_engagement"],
        accessToken: chosen.linkedFacebookPage.access_token,
        tokenType: "PAGE",
      },
      connectedById: user.id,
    }).catch((err) => console.warn("[oauth:instagram] auto-link facebook failed:", err));
  }

  await clearPendingConnection();
  revalidatePath(`/clients/${data.clientId}/settings`);
  revalidatePath(`/clients/${data.clientId}/plan`);
  revalidatePath("/posts");
}

type SaveInput = {
  clientId: string;
  platform: string;
  account: Awaited<ReturnType<ReturnType<typeof getOAuthAdapter>["listAccounts"]>>[number];
  connectedById: string;
  refreshToken?: string;
};

/** Shared by the picker and by the single-account fast path in the OAuth
 * callback, so both store exactly the same thing. */
export async function saveConnectedAccount({
  clientId, platform, account, connectedById, refreshToken,
}: SaveInput) {
  if (!isPlatformSlug(platform)) throw new Error("Unknown platform.");
  const prismaPlatform = SLUG_TO_PLATFORM[platform];

  // Ensure single @ prefix for handles
  const cleanAccountName = account.accountName.startsWith("@")
    ? `@${account.accountName.replace(/^@+/, "")}`
    : account.accountName;

  const shared = {
    accountName: cleanAccountName,
    avatarUrl: account.avatarUrl ?? null,
    accessToken: encryptToken(account.accessToken),
    tokenType: account.tokenType,
    // A Page or system-user token doesn't expire, so recording an expiry
    // for one would have the health check chasing a problem that isn't there.
    tokenExpiresAt: account.tokenType === "USER" ? account.expiresAt ?? null : null,
    connectionStatus: "CONNECTED" as const,
    statusDetail: null,
    scopes: account.scopes,
    connectedById,
    lastHealthCheckAt: new Date(),
  };

  // If connecting a real live account, clean up any previous mock/sandbox account
  // for this client and platform so the real account takes over without conflict.
  if (!account.externalAccountId.startsWith("sandbox_")) {
    const sandboxAccounts = await prisma.socialAccount.findMany({
      where: {
        clientId,
        platform: prismaPlatform,
        externalAccountId: { startsWith: "sandbox_" },
      },
      select: { id: true },
    });
    if (sandboxAccounts.length > 0) {
      const sandboxIds = sandboxAccounts.map((a) => a.id);
      await prisma.$transaction([
        prisma.scheduledJob.deleteMany({
          where: { socialAccountId: { in: sandboxIds } },
        }),
        prisma.socialAccount.deleteMany({
          where: { id: { in: sandboxIds } },
        }),
      ]).catch(() => {});
    }
  }

  // Enforce strict client isolation: exactly one account per platform per client
  await prisma.socialAccount.upsert({
    where: {
      clientId_platform: {
        clientId, platform: prismaPlatform,
      },
    },
    create: {
      clientId,
      platform: prismaPlatform,
      externalAccountId: account.externalAccountId,
      refreshToken: refreshToken ? encryptToken(refreshToken) : null,
      ...shared,
    },
    update: {
      externalAccountId: account.externalAccountId,
      ...shared,
      ...(refreshToken ? { refreshToken: encryptToken(refreshToken) } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: connectedById,
      action: "SOCIAL_ACCOUNT_CONNECTED",
      entityType: "Client",
      entityId: clientId,
      metadata: {
        platform,
        accountName: account.accountName,
        externalAccountId: account.externalAccountId,
        tokenType: account.tokenType,
      },
    },
  });
}

/** Abandoning the picker shouldn't leave a live token in the browser. */
export async function cancelPendingConnection(clientId: string) {
  await requireRole("ADMIN", "MANAGER");
  await clearPendingConnection();
  revalidatePath(`/clients/${clientId}/settings`);
  revalidatePath(`/clients/${clientId}/plan`);
  revalidatePath("/posts");
}

/**
 * Connect a mock/sandbox social account for development or staging testing.
 * Enables full end-to-end publishing tests before Meta App Review clearance.
 */
export async function connectSandboxSocialAccount(clientId: string, platform: Platform) {
  const user = await requireRole("ADMIN", "MANAGER");
  const platformName = platform.charAt(0) + platform.slice(1).toLowerCase();

  await prisma.socialAccount.upsert({
    where: {
      clientId_platform: {
        clientId,
        platform,
      },
    },
    create: {
      clientId,
      platform,
      externalAccountId: `sandbox_${platform.toLowerCase()}_${clientId}`,
      accountName: `@EyeLevel_${platformName}_Sandbox`,
      accessToken: encryptToken("simulated"),
      refreshToken: null,
      tokenExpiresAt: null,
      tokenType: "PAGE",
      scopes: ["pages_manage_posts", "instagram_content_publish"],
      connectionStatus: "CONNECTED",
      statusDetail: "Sandbox Dev Mode Account",
      connectedById: user.id,
      lastHealthCheckAt: new Date(),
    },
    update: {
      accountName: `@EyeLevel_${platformName}_Sandbox`,
      connectionStatus: "CONNECTED",
      statusDetail: "Sandbox Dev Mode Account",
      lastHealthCheckAt: new Date(),
    },
  });

  revalidatePath(`/clients/${clientId}/settings`);
  revalidatePath(`/clients/${clientId}/plan`);
}

