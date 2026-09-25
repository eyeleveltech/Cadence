"use server";

import { z } from "zod";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientAccess, requireClientWorkspaceAccess, isLeadership } from "@/lib/session";
import { createNotification, notifyMany } from "@/lib/notify";
import { refusePostStatusChange, STATUS_REFUSAL_MESSAGE } from "@/lib/roles";
import { getSocialAdapter } from "@/lib/social/adapter";
import type { Post, Role } from "@prisma/client";

const postStatusSchema = z.enum([
  "IDEA", "BRIEFED", "IN_DESIGN", "IN_COPYWRITING", "INTERNAL_REVIEW",
  "REVISION", "CLIENT_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED",
]);
const platformSchema = z.enum(["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE", "TWITTER"]);
const cuid = z.string().cuid();

/**
 * Load a post and authorize the caller against the client that owns it.
 * A missing post 404s rather than throwing a Prisma error into the
 * generic error boundary — and it 404s the same way an inaccessible one
 * does, so a wrong id and someone else's id look identical from outside.
 */
async function loadPostForWorkspace(postId: string) {
  const parsed = cuid.safeParse(postId);
  if (!parsed.success) notFound();

  const post = await prisma.post.findUnique({ where: { id: parsed.data } });
  if (!post) notFound();

  const user = await requireClientWorkspaceAccess(post.clientId);
  return { post, user };
}

/** The plan holds a year of posts before anyone thinks to archive one,
 * and each row drags its assets and their variants along. Capped, newest
 * scheduled first — raise the cap when someone asks for an archive view
 * rather than letting the page grow without limit. */
// Not exported: a "use server" module may only export async
// functions, and this is only ever used here.
const PLAN_PAGE_SIZE = 250;

export async function listPostsForClient(clientId: string) {
  await requireClientWorkspaceAccess(clientId);

  return prisma.post.findMany({
    take: PLAN_PAGE_SIZE,
    where: { clientId },
    include: {
      assets: { include: { mediaAsset: { include: { variants: true } } } },
      assignedDesigner: { select: { name: true } },
      assignedWriter: { select: { name: true } },
      campaign: { select: { name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function getPost(postId: string) {
  const { post: bare } = await loadPostForWorkspace(postId);

  return prisma.post.findUniqueOrThrow({
    where: { id: bare.id },
    include: {
      client: true,
      assets: { include: { mediaAsset: { include: { variants: true } } }, orderBy: { sortOrder: "asc" } },
      comments: { include: { author: { select: { name: true, role: true } } }, orderBy: { createdAt: "asc" } },
      moodReferences: { include: { moodBoardItem: true } },
      assignedDesigner: { select: { id: true, name: true } },
      assignedWriter: { select: { id: true, name: true } },
      scheduledJobs: true,
      analyticsSnapshots: true,
    },
  });
}

const createPostSchema = z.object({
  clientId: cuid,
  title: z.string().min(1).max(200),
  platforms: z.array(platformSchema).default([]),
  scheduledAt: z.coerce.date().optional(),
  campaignId: cuid.optional(),
  brief: z.string().max(2000).optional(),
});

export async function createPost(input: z.infer<typeof createPostSchema>) {
  const data = createPostSchema.parse(input);
  const user = await requireClientWorkspaceAccess(data.clientId);

  // A campaign id from another client would quietly file this post under
  // someone else's plan.
  if (data.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: data.campaignId },
      select: { clientId: true },
    });
    if (!campaign || campaign.clientId !== data.clientId) {
      throw new Error("That campaign doesn't belong to this client.");
    }
  }

  const post = await prisma.post.create({
    data: { ...data, createdById: user.id },
  });

  revalidatePath(`/clients/${data.clientId}/plan`);
  return post;
}

/**
 * Status is the one field with real consequences attached: CLIENT_REVIEW
 * puts work in front of the client, APPROVED is sign-off, and SCHEDULED
 * hands the post to the worker, which publishes it for real. So this
 * checks the move is a step the post can actually take, that the caller
 * is allowed to take it, and — for SCHEDULED — that the post is
 * genuinely ready to go out.
 */
export async function updatePostStatus(postId: string, status: unknown) {
  const nextStatus = postStatusSchema.parse(status);
  const { post, user } = await loadPostForWorkspace(postId);

  if (post.status === nextStatus) return;

  const refusal = refusePostStatusChange(post.status, nextStatus, user.role as Role);
  if (refusal) throw new Error(STATUS_REFUSAL_MESSAGE[refusal]);

  if (nextStatus === "SCHEDULED") {
    assertReadyToSchedule(post);
  }

  await prisma.post.update({
    where: { id: post.id },
    data: { status: nextStatus, statusChangedAt: new Date() },
  });

  revalidatePath(`/clients/${post.clientId}/plan`);
  revalidatePath(`/posts/${post.id}`);
}

/**
 * Everything the publisher needs for a real attempt at posting this.
 * Failing here is far cheaper than failing in the worker, where the only
 * signal is a notification after the slot has already passed.
 */
function assertReadyToSchedule(post: Post) {
  if (!post.scheduledAt) {
    throw new Error("Give the post a date and time before scheduling it.");
  }
  if (post.scheduledAt.getTime() <= Date.now()) {
    throw new Error("That slot is in the past — pick a future date and time.");
  }
  if (post.platforms.length === 0) {
    throw new Error("Pick at least one platform before scheduling.");
  }
}

export async function updatePostSchedule(postId: string, scheduledAt: Date) {
  const when = z.coerce.date().parse(scheduledAt);
  const { post } = await loadPostForWorkspace(postId);

  // Dragging an already-scheduled post backwards in time would either
  // fire it on the worker's next sweep or strand it silently.
  if (post.status === "SCHEDULED" && when.getTime() <= Date.now()) {
    throw new Error("That slot is in the past — unschedule the post first.");
  }

  await prisma.post.update({ where: { id: post.id }, data: { scheduledAt: when } });
  revalidatePath(`/clients/${post.clientId}/plan`);
  revalidatePath(`/posts/${post.id}`);
}

const updatePostContentSchema = z.object({
  postId: cuid,
  title: z.string().min(1).max(200).optional(),
  brief: z.string().max(2000).optional(),
  platforms: z.array(platformSchema).optional(),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().min(1).max(50)).max(30).optional(),
  collaborators: z.array(z.string().min(1).max(30)).max(3).optional(),
  postAsStory: z.boolean().optional(),
  assignedDesignerId: z.string().nullable().optional(),
  assignedWriterId: z.string().nullable().optional(),
});

export async function updatePostContent(input: z.infer<typeof updatePostContentSchema>) {
  const data = updatePostContentSchema.parse(input);
  const { post } = await loadPostForWorkspace(data.postId);

  // An assignee has to be someone who can actually open this client's
  // workspace — otherwise the work lands in a queue its owner can't
  // reach and the notification points at a 404.
  await assertAssignable(post.clientId, data.assignedDesignerId, "DESIGNER");
  await assertAssignable(post.clientId, data.assignedWriterId, "WRITER");

  const { postId, ...rest } = data;
  const updated = await prisma.post.update({ where: { id: postId }, data: rest });

  if (data.assignedDesignerId && data.assignedDesignerId !== post.assignedDesignerId) {
    await createNotification({
      userId: data.assignedDesignerId,
      type: "DESIGN_REQUESTED",
      title: `Assigned: ${updated.title}`,
      body: `You're the designer on "${updated.title}".`,
      link: `/posts/${postId}`,
    });
  }
  if (data.assignedWriterId && data.assignedWriterId !== post.assignedWriterId) {
    await createNotification({
      userId: data.assignedWriterId,
      type: "COPY_REQUESTED",
      title: `Assigned: ${updated.title}`,
      body: `You're the writer on "${updated.title}".`,
      link: `/posts/${postId}`,
    });
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath(`/clients/${post.clientId}/plan`);
}

/**
 * Admins and managers reach every client, so membership isn't the test
 * for them — the test is that they're a real internal user of the right
 * craft, never a client reviewer and never a stranger's id.
 */
async function assertAssignable(
  clientId: string,
  userId: string | null | undefined,
  craft: Extract<Role, "DESIGNER" | "WRITER">,
) {
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, clientMemberships: { where: { clientId }, select: { id: true } } },
  });

  if (!user || user.role === "CLIENT_REVIEWER") {
    throw new Error("That person can't be assigned to this post.");
  }
  if (user.role === craft && user.clientMemberships.length === 0) {
    throw new Error("Add that person to the client before assigning them work on it.");
  }
}

export async function attachAssetToPost(postId: string, mediaAssetId: string, sortOrder = 0) {
  const assetId = cuid.parse(mediaAssetId);
  const { post } = await loadPostForWorkspace(postId);

  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { clientId: true },
  });
  if (!asset || asset.clientId !== post.clientId) {
    throw new Error("That asset isn't in this client's library.");
  }

  await prisma.postAsset.upsert({
    where: { postId_mediaAssetId: { postId: post.id, mediaAssetId: assetId } },
    create: { postId: post.id, mediaAssetId: assetId, sortOrder },
    update: { sortOrder },
  });
  revalidatePath(`/posts/${post.id}`);
}

export async function removeAssetFromPost(postId: string, mediaAssetId: string) {
  const assetId = cuid.parse(mediaAssetId);
  const { post } = await loadPostForWorkspace(postId);

  // deleteMany, not delete: detaching something already detached is a
  // no-op, not a 500.
  await prisma.postAsset.deleteMany({
    where: { postId: post.id, mediaAssetId: assetId },
  });
  revalidatePath(`/posts/${post.id}`);
}

const addCommentSchema = z.object({
  postId: cuid,
  body: z.string().min(1).max(4000),
  type: z.enum(["COMMENT", "APPROVAL", "REVISION_REQUEST"]).default("COMMENT"),
});

/**
 * The one post action a client reviewer is meant to reach, so it
 * authorizes at reviewer level — and then decides separately who may
 * turn a comment into a verdict. Approving isn't commenting: it moves
 * the post's status, so it's gated on the stage the post is at and on
 * who is acting.
 */
export async function addApprovalComment(input: z.infer<typeof addCommentSchema>) {
  const data = addCommentSchema.parse(input);

  const post = await prisma.post.findUnique({ where: { id: data.postId } });
  if (!post) notFound();
  const user = await requireClientAccess(post.clientId);

  if (data.type !== "COMMENT") {
    assertMayDecide(post, user.id, user.role as Role);
  }

  const comment = await prisma.approvalComment.create({
    data: {
      ...data,
      authorId: user.id,
      visibility: clientFacing(post.status, user.role as Role, data.type) ? "CLIENT" : "INTERNAL",
    },
  });

  if (data.type === "APPROVAL") {
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "APPROVED", statusChangedAt: new Date() },
    });
  } else if (data.type === "REVISION_REQUEST") {
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "REVISION", statusChangedAt: new Date() },
    });
  }

  // Notify everyone on the post except whoever just acted.
  const interested = [post.createdById, post.assignedDesignerId, post.assignedWriterId]
    .filter((id) => id !== user.id);
  const byType = {
    APPROVAL: { type: "CLIENT_APPROVED", title: `Approved: ${post.title}`, body: `${user.name} approved "${post.title}".` },
    REVISION_REQUEST: { type: "REVISION_REQUESTED", title: `Revision requested: ${post.title}`, body: data.body },
    COMMENT: { type: "CLIENT_COMMENTED", title: `New comment: ${post.title}`, body: `${user.name}: ${data.body}` },
  } as const;
  await notifyMany(interested, { ...byType[data.type], link: `/posts/${post.id}` });

  revalidatePath(`/posts/${post.id}`);
  revalidatePath(`/clients/${post.clientId}/plan`);
  revalidatePath("/review");
  return comment;
}

/**
 * Which side of the wall a comment belongs on.
 *
 * Everything the client's own reviewer writes is theirs to see. From our
 * side, only a decision recorded at the client-review stage is — that's
 * a manager writing down the answer the client gave on a call, so hiding
 * it from the client would be nonsense. Everything else a team member
 * types is internal craft discussion, and it stays internal: the review
 * portal used to render the entire comment thread, INTERNAL_REVIEW notes
 * included.
 */
function clientFacing(status: Post["status"], role: Role, type: "COMMENT" | "APPROVAL" | "REVISION_REQUEST") {
  if (role === "CLIENT_REVIEWER") return true;
  return status === "CLIENT_REVIEW" && type !== "COMMENT";
}

/**
 * Who gets to approve or send back, and when.
 *
 * Internal review is a manager's call — a writer or designer signing off
 * their own work is the whole reason that stage exists. Client review is
 * the client's call, though a manager can record it on their behalf
 * after a phone call or a WhatsApp thumbs up. Either way the post has to
 * actually be sitting at a review stage: there's nothing to approve in a
 * post still being drafted, and re-approving a published one would drag
 * it back out of PUBLISHED.
 */
function assertMayDecide(post: Post, userId: string, role: Role) {
  if (post.status !== "INTERNAL_REVIEW" && post.status !== "CLIENT_REVIEW") {
    throw new Error("This post isn't waiting on a review right now.");
  }

  if (post.status === "INTERNAL_REVIEW") {
    if (!isLeadership(role)) {
      throw new Error("Internal sign-off is an admin or manager's call — leave a comment instead.");
    }
  } else if (role !== "CLIENT_REVIEWER" && !isLeadership(role)) {
    throw new Error("Only the client, or a manager recording their answer, can sign off at this stage.");
  }

  const ownsTheWork = post.assignedWriterId === userId || post.assignedDesignerId === userId;
  if (ownsTheWork) {
    throw new Error("You can't sign off work you're assigned to — ask someone else to review it.");
  }
}

/**
 * Deletes a post outright. There was no way to remove one at all, so a
 * mistyped idea sat in the plan forever.
 *
 * A published post is kept: the board claiming something never went out
 * when it did is worse than a bit of clutter, and the analytics attached
 * to it are the only record of how it performed.
 */
export async function deletePost(postId: string) {
  const { post, user } = await loadPostForWorkspace(postId);

  if (post.status === "PUBLISHED") {
    throw new Error("Published posts stay on the plan — they're the record of what went out.");
  }
  if (!isLeadership(user.role) && post.createdById !== user.id) {
    throw new Error("Only an admin, a manager, or whoever created it can delete a post.");
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "POST_DELETED",
      entityType: "Post",
      entityId: post.id,
      metadata: { title: post.title, status: post.status, clientId: post.clientId },
    },
  });

  await prisma.post.delete({ where: { id: post.id } });

  revalidatePath(`/clients/${post.clientId}/plan`);
}

/**
 * Immediate publish trigger for leadership (Admin / Manager).
 * Bypasses the 60s background worker queue and publishes directly via
 * Meta Graph API adapters, or runs in simulation mode if enabled.
 */
export async function publishPostNow(postId: string) {
  const { post, user } = await loadPostForWorkspace(postId);

  if (!isLeadership(user.role)) {
    throw new Error("Only admins and managers can trigger immediate publishing.");
  }

  if (post.status === "PUBLISHED") {
    throw new Error("This post is already published.");
  }

  if (post.platforms.length === 0) {
    throw new Error("Pick at least one platform before publishing.");
  }

  const fullPost = await prisma.post.findUniqueOrThrow({
    where: { id: post.id },
    include: { assets: { include: { mediaAsset: true } } },
  });

  const accounts = await prisma.socialAccount.findMany({
    where: { clientId: post.clientId, platform: { in: post.platforms } },
  });

  const isSimulate = process.env.SOCIAL_DEV_SIMULATE === "1";
  const results: { platform: string; ok: boolean; externalId?: string; error?: string }[] = [];

  for (const platform of post.platforms) {
    const found = accounts.find((a) => a.platform === platform);
    const account = found ?? (isSimulate ? {
      id: `sim_acc_${platform}`,
      clientId: post.clientId,
      platform,
      accountName: `Demo ${platform}`,
      avatarUrl: null,
      externalAccountId: `sim_ext_${platform}`,
      accessToken: "simulated",
      refreshToken: null,
      tokenExpiresAt: null,
      tokenType: "PAGE" as const,
      scopes: ["pages_manage_posts", "instagram_content_publish"],
      connectionStatus: "CONNECTED" as const,
      statusDetail: null,
      lastHealthCheckAt: new Date(),
      connectedById: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } : null);

    if (!account) {
      results.push({ platform, ok: false, error: `No connected account found for ${platform}.` });
      continue;
    }

    const idempotencyKey = `${post.id}:${platform}`;

    try {
      const adapter = getSocialAdapter(platform);
      const res = await adapter.publish({
        caption: fullPost.caption ?? "",
        hashtags: fullPost.hashtags,
        mediaUrls: fullPost.assets.map((a) => a.mediaAsset.originalUrl),
        postAsStory: fullPost.postAsStory,
        account,
      });

      if (account.id && !account.id.startsWith("sim_")) {
        await prisma.scheduledJob.upsert({
          where: { idempotencyKey },
          create: {
            postId: post.id,
            socialAccountId: account.id,
            platform,
            idempotencyKey,
            scheduledFor: new Date(),
            status: "DONE",
            platformPostId: res.externalId,
            publishedAt: new Date(),
          },
          update: {
            status: "DONE",
            platformPostId: res.externalId,
            publishedAt: new Date(),
          },
        });
      }

      results.push({ platform, ok: true, externalId: res.externalId });
    } catch (err) {
      results.push({
        platform,
        ok: false,
        error: err instanceof Error ? err.message : "Publish failed",
      });
    }
  }

  const anySuccess = results.some((r) => r.ok);
  const anyFailed = results.some((r) => !r.ok);

  if (!anySuccess && anyFailed) {
    const reasons = results.map((r) => `${r.platform}: ${r.error}`).join(" | ");
    throw new Error(`Failed to publish: ${reasons}`);
  }

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      statusChangedAt: new Date(),
    },
  });

  const interested = [post.createdById, post.assignedDesignerId, post.assignedWriterId]
    .filter(Boolean) as string[];
  await notifyMany(interested, {
    type: "POST_PUBLISHED",
    title: `Published: ${post.title}`,
    body: `"${post.title}" has been published to ${post.platforms.join(", ")}.`,
    link: `/posts/${post.id}`,
  });

  revalidatePath(`/posts/${post.id}`);
  revalidatePath(`/clients/${post.clientId}/plan`);

  return { success: true, results };
}

