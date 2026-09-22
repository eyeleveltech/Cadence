"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess, requireRole } from "@/lib/session";
import { storage } from "@/lib/storage";
import { processImageAsset, readImageMetadata } from "@/lib/media-pipeline";
import type { AssetKind } from "@prisma/client";

/**
 * What we accept, and the extension each one is stored under.
 *
 * The extension is taken from this table, never from the uploaded
 * filename — the filename is attacker-controlled, and it used to decide
 * both the stored path and (via static serving) the content type the
 * browser saw. For images the declared MIME isn't trusted either: sharp
 * reads the actual bytes below and the real format wins.
 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
  heif: "heic",
  heic: "heic",
};
const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB, above Reels' own 300MB cap

/**
 * Bulk upload — the actual workflow is "designer delivers thirty
 * creatives, planner drags the whole folder in at once," not one file
 * at a time. Every file in the FormData under the "files" key is
 * processed and returns its own success/failure so one bad file in a
 * batch of thirty doesn't fail the other twenty-nine.
 */
export async function uploadMediaAssets(clientId: string, formData: FormData) {
  const user = await requireClientWorkspaceAccess(clientId);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return { uploaded: [], failed: [] };
  }

  const uploaded: string[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const file of files) {
    try {
      if (file.size > MAX_FILE_BYTES) {
        failed.push({ name: file.name, reason: "File exceeds 500MB" });
        continue;
      }

      const videoExtension = VIDEO_EXTENSIONS[file.type];
      const buffer = Buffer.from(await file.arrayBuffer());

      // Images are identified by their bytes. A file claiming to be a
      // JPEG that sharp can't read is not an image, whatever it says.
      let kind: AssetKind;
      let extension: string;
      let dimensions: { width: number | null; height: number | null } = { width: null, height: null };

      if (videoExtension) {
        kind = "VIDEO";
        extension = videoExtension;
      } else {
        const probed = await readImageMetadata(buffer).catch(() => null);
        const format = probed?.format ? IMAGE_EXTENSIONS[probed.format] : undefined;
        if (!probed || !format) {
          failed.push({ name: file.name, reason: `Unsupported or unreadable file: ${file.type || "unknown type"}` });
          continue;
        }
        kind = "IMAGE";
        extension = format;
        dimensions = { width: probed.width, height: probed.height };
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          clientId,
          uploadedById: user.id,
          originalKind: kind,
          originalUrl: "", // filled in below once we have the asset id for the storage key
          mimeType: kind === "IMAGE" ? `image/${extension === "jpg" ? "jpeg" : extension}` : file.type,
          fileSizeBytes: file.size,
          status: "PROCESSING",
          tags: [],
        },
      });

      const originalKey = `${clientId}/${asset.id}/original.${extension}`;
      const originalUrl = await storage.save(originalKey, buffer, file.type);

      if (kind === "IMAGE") {
        const variants = await processImageAsset(clientId, asset.id, buffer);

        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: {
            originalUrl,
            width: dimensions.width,
            height: dimensions.height,
            status: "READY",
            variants: {
              create: variants.map((v) => ({
                kind: v.kind,
                url: v.url,
                width: v.width,
                height: v.height,
                fileSizeBytes: v.fileSizeBytes,
              })),
            },
          },
        });
      } else {
        // Video transcoding (ffmpeg — Reel/Story format conformance) runs
        // in the worker, not here. The original is usable as-is in the
        // meantime; platform-ready variants appear once that job exists.
        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: { originalUrl, status: "READY" },
        });
      }

      uploaded.push(asset.id);
    } catch (err) {
      failed.push({
        name: file.name,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  revalidatePath(`/clients/${clientId}/library`);
  return { uploaded, failed };
}

export async function listMediaAssets(clientId: string) {
  await requireClientWorkspaceAccess(clientId);

  return prisma.mediaAsset.findMany({
    // A library grows forever and every row carries its variants.
    take: 300,
    where: { clientId },
    include: {
      variants: true,
      uploadedBy: { select: { name: true } },
      _count: { select: { postAssets: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

const tagSchema = z.object({
  assetId: z.string().cuid(),
  clientId: z.string().cuid(),
  tags: z.array(z.string().min(1).max(40)).max(25),
});

export async function tagMediaAsset(assetId: string, clientId: string, tags: string[]) {
  const data = tagSchema.parse({ assetId, clientId, tags });
  await requireClientWorkspaceAccess(data.clientId);

  // Authorizing the clientId the caller passed says nothing about the
  // asset they passed — without this, access to any one client is access
  // to every asset in the system.
  const owned = await prisma.mediaAsset.findFirst({
    where: { id: data.assetId, clientId: data.clientId },
    select: { id: true },
  });
  if (!owned) throw new Error("That asset isn't in this client's library.");

  await prisma.mediaAsset.update({
    where: { id: data.assetId },
    data: { tags: [...new Set(data.tags.map((t) => t.trim()).filter(Boolean))] },
  });
  revalidatePath(`/clients/${data.clientId}/library`);
}

export async function deleteMediaAsset(assetId: string, clientId: string) {
  const id = z.string().cuid().parse(assetId);
  const client = z.string().cuid().parse(clientId);
  const user = await requireRole("ADMIN", "MANAGER");

  const asset = await prisma.mediaAsset.findFirst({
    where: { id, clientId: client },
    select: { id: true },
  });
  if (!asset) throw new Error("That asset isn't in this client's library.");

  // Detach first: PostAsset and MoodBoardItem both reference the asset
  // without a cascade, so deleting it while it's in use used to fail on a
  // foreign key. Deleting the library copy removes it from the posts and
  // boards that used it — that's what "delete" means here.
  await prisma.$transaction([
    prisma.postAsset.deleteMany({ where: { mediaAssetId: id } }),
    prisma.moodBoardItem.deleteMany({ where: { uploadedAssetId: id } }),
    prisma.mediaAsset.delete({ where: { id } }),
  ]);

  // The row was the only thing pointing at these files; without this they
  // stay on disk forever, still readable to anyone on the client.
  await storage.deletePrefix(`${client}/${id}`);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "MEDIA_ASSET_DELETED",
      entityType: "MediaAsset",
      entityId: id,
      metadata: { clientId: client },
    },
  });

  revalidatePath(`/clients/${client}/library`);
}
