"use server";

import { z } from "zod";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess } from "@/lib/session";
import { fetchOpenGraphPreview } from "@/lib/og-scrape";

const cuid = z.string().cuid();

/**
 * Authorizing the clientId the caller passed proves nothing about the
 * board id they passed alongside it. Every write below resolves the
 * board and checks it actually belongs to that client first — otherwise
 * access to any one client is write access to every board in the system.
 */
async function requireBoardInClient(clientId: string, moodBoardId: string) {
  const user = await requireClientWorkspaceAccess(clientId);

  const board = await prisma.moodBoard.findFirst({
    where: { id: moodBoardId, clientId },
    select: { id: true },
  });
  if (!board) throw new Error("That board doesn't belong to this client.");

  return user;
}

export async function listMoodBoards(clientId: string) {
  await requireClientWorkspaceAccess(clientId);

  return prisma.moodBoard.findMany({
    where: { clientId },
    include: {
      items: {
        take: 200,
        include: { addedBy: { select: { name: true } }, uploadedAsset: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

const createBoardSchema = z.object({
  clientId: cuid,
  name: z.string().min(1).max(120),
});

export async function createMoodBoard(input: z.infer<typeof createBoardSchema>) {
  const data = createBoardSchema.parse(input);
  await requireClientWorkspaceAccess(data.clientId);

  const board = await prisma.moodBoard.create({ data });
  revalidatePath(`/clients/${data.clientId}/boards`);
  return board;
}

const addUrlItemSchema = z.object({
  clientId: cuid,
  moodBoardId: cuid,
  sourceUrl: z.string().url(),
  moodTags: z.array(z.string().min(1).max(40)).max(25).default([]),
});

/** Add a reference by URL — Pinterest, YouTube, Instagram, anything.
 * We fetch a title/thumbnail best-effort via Open Graph tags. */
export async function addMoodBoardUrlItem(input: z.infer<typeof addUrlItemSchema>) {
  const data = addUrlItemSchema.parse(input);
  const user = await requireBoardInClient(data.clientId, data.moodBoardId);

  const preview = await fetchOpenGraphPreview(data.sourceUrl);

  const item = await prisma.moodBoardItem.create({
    data: {
      moodBoardId: data.moodBoardId,
      type: "URL",
      sourceUrl: data.sourceUrl,
      thumbnailUrl: preview.image,
      title: preview.title,
      moodTags: data.moodTags,
      addedById: user.id,
    },
  });

  revalidatePath(`/clients/${data.clientId}/boards`);
  return item;
}

const addTextItemSchema = z.object({
  clientId: cuid,
  moodBoardId: cuid,
  title: z.string().min(1).max(500),
  moodTags: z.array(z.string().min(1).max(40)).max(25).default([]),
});

export async function addMoodBoardTextItem(input: z.infer<typeof addTextItemSchema>) {
  const data = addTextItemSchema.parse(input);
  const user = await requireBoardInClient(data.clientId, data.moodBoardId);

  const item = await prisma.moodBoardItem.create({
    data: {
      moodBoardId: data.moodBoardId,
      type: "TEXT",
      title: data.title,
      moodTags: data.moodTags,
      addedById: user.id,
    },
  });

  revalidatePath(`/clients/${data.clientId}/boards`);
  return item;
}

export async function deleteMoodBoardItem(clientId: string, itemId: string) {
  const client = cuid.parse(clientId);
  const id = cuid.parse(itemId);
  await requireClientWorkspaceAccess(client);

  const item = await prisma.moodBoardItem.findFirst({
    where: { id, moodBoard: { clientId: client } },
    select: { id: true },
  });
  if (!item) throw new Error("That reference doesn't belong to this client.");

  await prisma.moodBoardItem.delete({ where: { id } });
  revalidatePath(`/clients/${client}/boards`);
}

/**
 * Pins a board tile to a post as a design reference. Both sides are
 * resolved and checked against the same client: this is a server action,
 * so it's a live endpoint whether or not the UI calls it yet, and it
 * previously took two ids from the caller and wrote the row with no
 * authorization at all.
 */
export async function pinMoodItemToPost(postId: string, moodBoardItemId: string) {
  const post = await prisma.post.findUnique({
    where: { id: cuid.parse(postId) },
    select: { id: true, clientId: true },
  });
  if (!post) notFound();

  await requireClientWorkspaceAccess(post.clientId);

  const item = await prisma.moodBoardItem.findFirst({
    where: { id: cuid.parse(moodBoardItemId), moodBoard: { clientId: post.clientId } },
    select: { id: true },
  });
  if (!item) throw new Error("That reference isn't on one of this client's boards.");

  await prisma.postMoodReference.upsert({
    where: { postId_moodBoardItemId: { postId: post.id, moodBoardItemId: item.id } },
    create: { postId: post.id, moodBoardItemId: item.id },
    update: {},
  });

  revalidatePath(`/posts/${post.id}`);
}
