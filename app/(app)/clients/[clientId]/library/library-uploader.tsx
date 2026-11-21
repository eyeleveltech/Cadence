"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaFile } from "@/components/posts/asset-upload";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LibraryUploader({ clientId }: { clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      const fileList = Array.from(files);
      const toastId = toast.loading(
        fileList.length === 1
          ? `Uploading ${fileList[0].name}…`
          : `Uploading ${fileList.length} files…`
      );

      try {
        let uploadedCount = 0;
        const failed: { name: string; reason: string }[] = [];

        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          try {
            await uploadMediaFile(clientId, file, {
              onProgress: (pct) => {
                toast.loading(
                  fileList.length === 1
                    ? `Uploading ${file.name}: ${pct}%…`
                    : `Uploading (${i + 1}/${fileList.length}) ${file.name}: ${pct}%…`,
                  { id: toastId }
                );
              },
            });
            uploadedCount++;
          } catch (uploadErr) {
            failed.push({
              name: file.name,
              reason: uploadErr instanceof Error ? uploadErr.message : "Upload failed",
            });
          }
        }

        toast.dismiss(toastId);

        if (uploadedCount > 0) {
          toast.success(
            `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded`,
          );
          router.refresh();
        }

        if (failed.length > 0) {
          failed.forEach((f) => toast.error(`${f.name}: ${f.reason}`));
        }
      } catch (err) {
        console.error("Upload error:", err);
        toast.dismiss(toastId);
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [clientId, router],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-10 py-14 text-center transition-colors",
        dragging ? "border-primary bg-[var(--accent-soft)]" : "border-border hover:border-[var(--ink4)]",
      )}
    >
      <Upload className="size-6 text-[var(--ink3)]" />
      <p className="font-medium">{uploading ? "Uploading…" : "Drop files here or click to upload"}</p>
      <p className="text-sm text-[var(--ink3)]">Multiple files at once are fine.</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
