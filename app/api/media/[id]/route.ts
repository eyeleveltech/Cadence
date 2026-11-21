import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { configureCloudinary } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id },
      select: { id: true, clientId: true, originalUrl: true, originalKind: true },
    });

    if (!asset) {
      return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
    }

    // Cloudinary deletion if hosted on Cloudinary
    if (asset.originalUrl && asset.originalUrl.includes("res.cloudinary.com")) {
      try {
        configureCloudinary();
        const parts = asset.originalUrl.split("/");
        const uploadIdx = parts.findIndex((p) => p === "upload");
        if (uploadIdx !== -1) {
          const afterUpload = parts.slice(uploadIdx + 1);
          const withoutVersion = afterUpload[0]?.startsWith("v") ? afterUpload.slice(1) : afterUpload;
          const publicIdWithExt = withoutVersion.join("/");
          const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");
          if (publicId) {
            await cloudinary.uploader.destroy(publicId, {
              resource_type: asset.originalKind === "VIDEO" ? "video" : "image",
            });
            console.log(`[DELETE /api/media/${id}] Destroyed Cloudinary asset: ${publicId}`);
          }
        }
      } catch (cErr) {
        console.warn(`[DELETE /api/media/${id}] Cloudinary destroy failed:`, cErr);
      }
    }

    // Clean up dependent foreign-key records before deleting mediaAsset
    await prisma.$transaction([
      prisma.postAsset.deleteMany({ where: { mediaAssetId: id } }),
      prisma.moodBoardItem.deleteMany({ where: { uploadedAssetId: id } }),
      prisma.mediaAsset.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete media asset";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
