"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import type { listMediaAssets } from "@/lib/actions/media";
import { deleteMediaAsset } from "@/lib/actions/media";
import { Trash2, Film } from "lucide-react";
import { toast } from "sonner";

type Asset = Awaited<ReturnType<typeof listMediaAssets>>[number];

export function LibraryGrid({ clientId, assets }: { clientId: string; assets: Asset[] }) {
  const router = useRouter();

  if (assets.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nothing in the library yet — upload above to get started.
      </p>
    );
  }

  async function handleDelete(assetId: string) {
    if (!window.confirm("Delete this asset? This can't be undone.")) return;
    try {
      await deleteMediaAsset(assetId, clientId);
      toast.success("Deleted");
      router.refresh();
    } catch {
      toast.error("Couldn't delete — admin or manager access required");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => {
        const thumb = asset.variants.find((v) => v.kind === "THUMBNAIL");
        const placed = asset._count.postAssets > 0;
        const filename = decodeURIComponent(asset.originalUrl.split("/").pop() ?? "file");

        return (
          <div key={asset.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative aspect-[4/5] bg-[var(--fill)]">
              {asset.originalKind === "IMAGE" && (thumb || asset.originalUrl) ? (
                <Image
                  src={thumb?.url ?? asset.originalUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Film className="size-8 text-[var(--ink4)]" />
                </div>
              )}
              {asset.status === "PROCESSING" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                  Processing…
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-3">
              <span className={placed ? "om-pill om-pill-solid" : "om-pill"}>{placed ? "Placed" : "Unplaced"}</span>
              <span className="truncate text-sm text-[var(--ink2)]">{filename}</span>
              <button
                onClick={() => handleDelete(asset.id)}
                className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--ink3)] transition-colors hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
