import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getSession } from "@/lib/session";
import { configureCloudinary, isCloudinaryConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(_req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        { error: "Cloudinary credentials not configured in environment" },
        { status: 503 }
      );
    }

    configureCloudinary();

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = "cadence_media";

    const apiSecret =
      process.env.CLOUDINARY_API_SECRET ||
      (cloudinary.config().api_secret as string | undefined);
    const apiKey =
      process.env.CLOUDINARY_API_KEY ||
      (cloudinary.config().api_key as string | undefined);
    const cloudName =
      process.env.CLOUDINARY_CLOUD_NAME ||
      (cloudinary.config().cloud_name as string | undefined);

    if (!apiSecret || !apiKey || !cloudName) {
      return NextResponse.json(
        { error: "Incomplete Cloudinary configuration" },
        { status: 500 }
      );
    }

    // Generate signed payload
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      apiSecret
    );

    return NextResponse.json({
      timestamp,
      signature,
      folder,
      apiKey,
      cloudName,
    });
  } catch (error: unknown) {
    console.error("[Cloudinary Sign Error]:", error);
    const message = error instanceof Error ? error.message : "Failed to generate upload signature";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
