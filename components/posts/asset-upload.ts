import { registerDirectMediaAsset, uploadMediaAssets } from "@/lib/actions/media";

export type DirectUploadResult = {
  url: string;
  publicId: string;
  resourceType: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
  format?: string;
};

/**
 * Uploads a file directly to Cloudinary from the browser using a signed request.
 * Supports real-time upload progress via XMLHttpRequest.
 */
export async function uploadMediaDirectly(
  file: File,
  onProgress?: (pct: number) => void
): Promise<DirectUploadResult> {
  // 1. Get signature from lightweight backend endpoint
  const signRes = await fetch("/api/upload/sign", { method: "POST" });
  if (!signRes.ok) {
    const errData = await signRes.json().catch(() => ({}));
    throw new Error(errData.error || "Could not get upload signature");
  }
  const { timestamp, signature, folder, apiKey, cloudName } = await signRes.json();

  if (!apiKey || !cloudName || !signature) {
    throw new Error("Incomplete upload credentials from signature endpoint");
  }

  // 2. Prepare FormData for Cloudinary
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);
  formData.append("folder", folder);

  // 3. Upload directly to Cloudinary with real-time progress
  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve({
            url: response.secure_url || response.url,
            publicId: response.public_id,
            resourceType: response.resource_type,
            width: response.width,
            height: response.height,
            duration: response.duration,
            bytes: response.bytes,
            format: response.format,
          });
        } catch {
          reject(new Error("Failed to parse Cloudinary upload response"));
        }
      } else {
        let errMsg = `Cloudinary upload failed: ${xhr.statusText || xhr.status}`;
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.error?.message) errMsg = res.error.message;
        } catch {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during media upload"));
    xhr.send(formData);
  });
}

/**
 * Handles single or multiple file uploads:
 * Attempts high-speed direct signed Cloudinary upload first.
 * If Cloudinary is not configured, automatically falls back to local server upload.
 */
export async function uploadMediaFile(
  clientId: string,
  file: File,
  options?: {
    postId?: string;
    sortOrder?: number;
    onProgress?: (pct: number) => void;
  }
): Promise<{ assetId: string; url: string }> {
  try {
    // 1. Try direct-to-Cloudinary signed upload
    const uploaded = await uploadMediaDirectly(file, options?.onProgress);

    // 2. Persist metadata to PostgreSQL via Prisma action
    const { assetId, asset } = await registerDirectMediaAsset(
      clientId,
      {
        url: uploaded.url,
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: uploaded.bytes || file.size,
        width: uploaded.width,
        height: uploaded.height,
        durationSecs: uploaded.duration,
      },
      {
        postId: options?.postId,
        sortOrder: options?.sortOrder,
      }
    );

    return { assetId, url: asset.originalUrl };
  } catch (directErr) {
    console.warn(
      `[uploadMediaFile] Direct upload failed for ${file.name}, falling back to server proxy upload:`,
      directErr
    );

    // Fallback to server action
    const formData = new FormData();
    formData.append("files", file);
    const res = await uploadMediaAssets(clientId, formData);

    if (res.uploaded.length > 0) {
      return { assetId: res.uploaded[0], url: "" };
    }
    const failedMsg = res.failed[0]?.reason || "Failed to upload asset";
    throw new Error(failedMsg);
  }
}
