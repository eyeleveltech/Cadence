"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaAssets } from "@/lib/actions/media";
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
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));

      try {
        const result = await uploadMediaAssets(clientId, formData);
        if (result.uploaded.length) {
          toast.success(
            `${result.uploaded.length} file${result.uploaded.length === 1 ? "" : "s"} uploaded`,
          );
        }
        result.failed.forEach((f) => toast.error(`${f.name}: ${f.reason}`));
        router.refresh();
      } catch (err) {
        console.error("Upload error:", err);
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
