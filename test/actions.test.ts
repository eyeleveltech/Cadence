import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "test-secret";
});

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  requireClientAccess,
  requireClientWorkspaceAccess,
} from "@/lib/session";
import {
  updatePostStatus,
  addApprovalComment,
  getPost,
  publishPostNow,
  validatePostForPublishing,
} from "@/lib/actions/posts";
import { listAllUsers } from "@/lib/actions/team";
import { syncClientAnalyticsNow } from "@/lib/actions/analytics";
import * as analyticsModule from "@/lib/social/analytics";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  }),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

describe("Server Actions & Multi-Tenant Isolation (test/actions.test.ts)", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    vi.restoreAllMocks();
    vi.spyOn(prisma.notification, "createMany").mockResolvedValue({ count: 0 });
    vi.spyOn(prisma.notification, "create").mockResolvedValue({} as never);
  });

  describe("1. Multi-Tenant Isolation & Session Scoping (lib/session.ts)", () => {
    it("allows ADMIN and MANAGER across any client without a ClientMember record", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN", name: "Admin User", email: "admin@agency.com" },
        session: { id: "s1", userId: "admin-1", expiresAt: new Date() },
      } as never);

      const membershipSpy = vi.spyOn(prisma.clientMember, "findUnique");

      const user = await requireClientWorkspaceAccess("client-target-99");
      expect(user.id).toBe("admin-1");
      expect(user.role).toBe("ADMIN");
      // Admin bypasses database lookup for ClientMember
      expect(membershipSpy).not.toHaveBeenCalled();
    });

    it("allows WRITER or DESIGNER when assigned to the specific client via ClientMember", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "writer-1", role: "WRITER", name: "Writer User", email: "writer@agency.com" },
        session: { id: "s2", userId: "writer-1", expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.clientMember, "findUnique").mockResolvedValue({
        id: "cm-1",
        clientId: "client-allowed",
        userId: "writer-1",
        createdAt: new Date(),
      } as never);

      const user = await requireClientWorkspaceAccess("client-allowed");
      expect(user.id).toBe("writer-1");
    });

    it("triggers notFound() when a WRITER attempts to access a client they are NOT assigned to", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "writer-1", role: "WRITER", name: "Writer User", email: "writer@agency.com" },
        session: { id: "s2", userId: "writer-1", expiresAt: new Date() },
      } as never);

      // Return null -> no membership in this tenant
      vi.spyOn(prisma.clientMember, "findUnique").mockResolvedValue(null);

      await expect(requireClientWorkspaceAccess("client-forbidden")).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    });

    it("triggers notFound() when CLIENT_REVIEWER attempts to access internal workspace", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "rev-1", role: "CLIENT_REVIEWER", name: "Client Person", email: "client@brand.com" },
        session: { id: "s3", userId: "rev-1", expiresAt: new Date() },
      } as never);

      // They have membership on this client for review portal
      vi.spyOn(prisma.clientMember, "findUnique").mockResolvedValue({
        id: "cm-2",
        clientId: "client-brand",
        userId: "rev-1",
        createdAt: new Date(),
      } as never);

      // But internal workspace access is forbidden
      await expect(requireClientWorkspaceAccess("client-brand")).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );

      // While client portal access is allowed
      const reviewUser = await requireClientAccess("client-brand");
      expect(reviewUser.id).toBe("rev-1");
    });

    it("enforces tenant boundary on getPost for unauthorized users", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "writer-1", role: "WRITER", name: "Writer User", email: "writer@agency.com" },
        session: { id: "s2", userId: "writer-1", expiresAt: new Date() },
      } as never);

      const targetPostId = "claaaaaaaaaaaaaaaaaaaaaaa";
      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: targetPostId,
        clientId: "client-other-brand",
        title: "Confidential Competitor Campaign",
      } as never);

      // User has no membership in client-other-brand
      vi.spyOn(prisma.clientMember, "findUnique").mockResolvedValue(null);

      await expect(getPost(targetPostId)).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });

  describe("2. Post Workflow & Self-Review Guard (lib/actions/posts.ts)", () => {
    const validPostId = "claaaaaaaaaaaaaaaaaaaaa01";

    it("allows valid forward status progression (IDEA -> BRIEFED)", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "manager-1", role: "MANAGER", name: "Manager User", email: "m@agency.com" },
        session: { id: "s4", userId: "manager-1", expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: validPostId,
        clientId: "client-1",
        status: "IDEA",
      } as never);

      const updateSpy = vi.spyOn(prisma.post, "update").mockResolvedValue({
        id: validPostId,
        status: "BRIEFED",
      } as never);

      await updatePostStatus(validPostId, "BRIEFED");

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validPostId },
          data: expect.objectContaining({ status: "BRIEFED" }),
        }),
      );
    });

    it("refuses invalid status jumps (e.g. IDEA -> SCHEDULED)", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN", name: "Admin", email: "a@agency.com" },
        session: { id: "s1", userId: "admin-1", expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: validPostId,
        clientId: "client-1",
        status: "IDEA",
      } as never);

      await expect(updatePostStatus(validPostId, "SCHEDULED")).rejects.toThrow(
        "That isn't a step this post can take from where it is.",
      );
    });

    it("enforces self-review guard: assigned writer/designer cannot approve their own post", async () => {
      const activeUserId = "user-assigned-writer";
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: activeUserId, role: "MANAGER", name: "Writer Manager", email: "wm@agency.com" },
        session: { id: "s5", userId: activeUserId, expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: validPostId,
        clientId: "client-1",
        title: "Launch Announcement",
        status: "INTERNAL_REVIEW",
        assignedWriterId: activeUserId, // Assigned to self!
        assignedDesignerId: "other-designer",
        createdById: "creator-id",
      } as never);

      await expect(
        addApprovalComment({
          postId: validPostId,
          body: "Looks good to me!",
          type: "APPROVAL",
        }),
      ).rejects.toThrow("You can't sign off work you're assigned to — ask someone else to review it.");
    });

    it("allows independent manager to approve a post in INTERNAL_REVIEW", async () => {
      const reviewerId = "independent-manager";
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: reviewerId, role: "MANAGER", name: "Reviewer Manager", email: "rm@agency.com" },
        session: { id: "s6", userId: reviewerId, expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: validPostId,
        clientId: "client-1",
        title: "Launch Announcement",
        status: "INTERNAL_REVIEW",
        assignedWriterId: "writer-person",
        assignedDesignerId: "designer-person",
        createdById: "creator-id",
      } as never);

      vi.spyOn(prisma.approvalComment, "create").mockResolvedValue({
        id: "comm-1",
        postId: validPostId,
        authorId: reviewerId,
        type: "APPROVAL",
        body: "Approved for client review",
        visibility: "INTERNAL",
        createdAt: new Date(),
      } as never);

      const updateSpy = vi.spyOn(prisma.post, "update").mockResolvedValue({
        id: validPostId,
        status: "APPROVED",
      } as never);

      const res = await addApprovalComment({
        postId: validPostId,
        body: "Approved for client review",
        type: "APPROVAL",
      });

      expect(res.id).toBe("comm-1");
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validPostId },
          data: expect.objectContaining({ status: "APPROVED" }),
        }),
      );
    });
  });

  describe("3. Team & Analytics Actions (lib/actions/team.ts, lib/actions/analytics.ts)", () => {
    it("listAllUsers accurately computes isPendingInvite flag", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN", name: "Admin", email: "a@agency.com" },
        session: { id: "s1", userId: "admin-1", expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.user, "findMany").mockResolvedValue([
        {
          id: "u-active",
          name: "Active Member",
          email: "active@agency.com",
          role: "WRITER",
          createdAt: new Date(),
          _count: { clientMemberships: 2 },
        },
        {
          id: "u-pending",
          name: "Pending Member",
          email: "pending@agency.com",
          role: "DESIGNER",
          createdAt: new Date(),
          _count: { clientMemberships: 0 },
        },
      ] as never);

      // u-pending has an unexpired reset-password verification token
      vi.spyOn(prisma.verification, "findMany").mockResolvedValue([
        { value: "u-pending" },
      ] as never);

      const users = await listAllUsers();
      expect(users.length).toBe(2);

      const active = users.find((u) => u.id === "u-active");
      const pending = users.find((u) => u.id === "u-pending");

      expect(active?.isPendingInvite).toBe(false);
      expect(pending?.isPendingInvite).toBe(true);
    });

    it("syncClientAnalyticsNow pulls metrics and creates AnalyticsSnapshot records", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "manager-1", role: "MANAGER", name: "Manager", email: "m@agency.com" },
        session: { id: "s4", userId: "manager-1", expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.scheduledJob, "findMany").mockResolvedValue([
        {
          id: "job-1",
          postId: "post-100",
          platform: "TWITTER",
          platformPostId: "sim_tweet_112233",
          socialAccount: {
            id: "sa-1",
            accessToken: "mock-token",
          },
        },
      ] as never);

      vi.spyOn(analyticsModule, "fetchPostMetrics").mockResolvedValue({
        impressions: 4200,
        reach: 3500,
        likes: 120,
        comments: 15,
        shares: 25,
        saves: 10,
        engagements: 170,
      });

      const snapshotCreateSpy = vi
        .spyOn(prisma.analyticsSnapshot, "create")
        .mockResolvedValue({
          id: "snap-1",
          postId: "post-100",
          platform: "TWITTER",
          impressions: 4200,
          reach: 3500,
          likes: 120,
          comments: 15,
          shares: 25,
          saves: 10,
          engagements: 170,
          pulledAt: new Date(),
        } as never);

      const result = await syncClientAnalyticsNow("client-1");

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
      expect(snapshotCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: "post-100",
            platform: "TWITTER",
            impressions: 4200,
            engagements: 170,
          }),
        }),
      );
    });
  });

  describe("4. Pre-Publish & Platform-Specific Media Validations (lib/actions/posts.ts)", () => {
    const validPostId = "claaaaaaaaaaaaaaaaaaaaa99";

    it("rejects when no platform is selected", async () => {
      await expect(
        validatePostForPublishing({
          id: validPostId,
          clientId: "client-1",
          platforms: [],
        }),
      ).rejects.toThrow("Pick at least one platform before publishing.");
    });

    it("rejects when an account is not connected for the selected platform", async () => {
      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([]);

      await expect(
        validatePostForPublishing({
          id: validPostId,
          clientId: "client-1",
          platforms: ["INSTAGRAM"],
        }),
      ).rejects.toThrow("Instagram account is not connected for this client. Please configure it in Settings.");
    });

    it("rejects when targeting INSTAGRAM with 0 media assets attached", async () => {
      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([
        {
          id: "sa-ig",
          clientId: "client-1",
          platform: "INSTAGRAM",
          connectionStatus: "CONNECTED",
        } as never,
      ]);

      vi.spyOn(prisma.postAsset, "count").mockResolvedValue(0);

      await expect(
        validatePostForPublishing({
          id: validPostId,
          clientId: "client-1",
          platforms: ["INSTAGRAM"],
        }),
      ).rejects.toThrow("Instagram requires at least one image or video asset to publish.");
    });

    it("passes validation when account is connected and Instagram has at least one asset", async () => {
      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([
        {
          id: "sa-ig",
          clientId: "client-1",
          platform: "INSTAGRAM",
          connectionStatus: "CONNECTED",
        } as never,
      ]);

      vi.spyOn(prisma.postAsset, "count").mockResolvedValue(2);

      await expect(
        validatePostForPublishing({
          id: validPostId,
          clientId: "client-1",
          platforms: ["INSTAGRAM"],
        }),
      ).resolves.toBeUndefined();
    });

    it("fails validation when YouTube is selected but no video asset is attached", async () => {
      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([
        {
          id: "sa-yt",
          clientId: "client-1",
          platform: "YOUTUBE",
          connectionStatus: "CONNECTED",
        } as never,
      ]);

      vi.spyOn(prisma.postAsset, "findMany").mockResolvedValue([
        {
          mediaAsset: {
            originalKind: "IMAGE",
            mimeType: "image/jpeg",
            originalUrl: "photo.jpg",
          },
        } as never,
      ]);

      await expect(
        validatePostForPublishing({
          id: validPostId,
          clientId: "client-1",
          platforms: ["YOUTUBE"],
        }),
      ).rejects.toThrow(
        "YouTube only supports video uploads (MP4, MOV). Please remove YouTube from this post or attach a video asset.",
      );
    });

    it("passes validation when YouTube is selected and a video asset is attached", async () => {
      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([
        {
          id: "sa-yt",
          clientId: "client-1",
          platform: "YOUTUBE",
          connectionStatus: "CONNECTED",
        } as never,
      ]);

      vi.spyOn(prisma.postAsset, "findMany").mockResolvedValue([
        {
          mediaAsset: {
            originalKind: "VIDEO",
            mimeType: "video/mp4",
            originalUrl: "clip.mp4",
          },
        } as never,
      ]);

      await expect(
        validatePostForPublishing({
          id: validPostId,
          clientId: "client-1",
          platforms: ["YOUTUBE"],
        }),
      ).resolves.toBeUndefined();
    });

    it("prevents scheduling a post when social account is not connected", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN", name: "Admin", email: "admin@agency.com" },
        session: { id: "s-admin", userId: "admin-1", expiresAt: new Date() },
      } as never);

      const futureDate = new Date(Date.now() + 86400000);
      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: validPostId,
        clientId: "client-1",
        status: "APPROVED",
        scheduledAt: futureDate,
        platforms: ["INSTAGRAM"],
      } as never);

      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([]);

      await expect(
        updatePostStatus(validPostId, "SCHEDULED"),
      ).rejects.toThrow("Instagram account is not connected for this client. Please configure it in Settings.");
    });

    it("publishPostNow invokes pre-publish validations before calling platform adapter", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN", name: "Admin", email: "admin@agency.com" },
        session: { id: "s-admin", userId: "admin-1", expiresAt: new Date() },
      } as never);

      vi.spyOn(prisma.post, "findUnique").mockResolvedValue({
        id: validPostId,
        clientId: "client-1",
        status: "APPROVED",
        platforms: ["INSTAGRAM"],
      } as never);

      vi.spyOn(prisma.socialAccount, "findMany").mockResolvedValue([]);

      await expect(
        publishPostNow(validPostId),
      ).rejects.toThrow("Instagram account is not connected for this client. Please configure it in Settings.");
    });

    it("disconnectSocialAccount cleans up dependent ScheduledJobs and deletes account", async () => {
      const { disconnectSocialAccount } = await import("@/lib/actions/social-accounts");

      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN", name: "Admin", email: "admin@agency.com" },
        session: { id: "s-admin", userId: "admin-1", expiresAt: new Date() },
      } as never);

      const clientId = "cmwj7jtmf0001u0jc7qnfiyqa";
      const accountId = "cmwj7jtmf0002u0jc7qnfiyqb";

      vi.spyOn(prisma.socialAccount, "findUniqueOrThrow").mockResolvedValue({
        id: accountId,
        clientId,
        platform: "FACEBOOK",
        accountName: "Tigermuthuvel9 Connected Page",
      } as never);

      const txSpy = vi.spyOn(prisma, "$transaction").mockImplementation(async (promises: unknown) => promises);
      vi.spyOn(prisma.auditLog, "create").mockResolvedValue({} as never);

      await expect(
        disconnectSocialAccount({ clientId, accountId }),
      ).resolves.toBeUndefined();

      expect(txSpy).toHaveBeenCalledTimes(1);
    });
  });
});
