"use client";

import { Film, Upload, ImageIcon } from "lucide-react";
import type { DemoLibraryAsset } from "@/lib/demo/data";
import { toast } from "sonner";

export function DemoLibraryGrid({ assets }: { assets: DemoLibraryAsset[] }) {
  return (
    <>
      <button
        onClick={() => toast("This is a demo — uploads aren't saved.")}
        className="flex w-full flex-col items-center gap-2 rounded-[10px] border border-dashed border-border p-10 text-center text-[var(--ink3)] hover:border-[var(--ink4)]"
      >
        <Upload className="size-6" />
        <span className="text-sm font-medium text-foreground">Drop a month of creatives here, or click to browse</span>
        <span className="text-xs">Images and videos. PNG converts to JPEG automatically; Story crops generate on upload.</span>
      </button>

      {assets.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--ink3)]">Nothing in the library yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-lg border border-border bg-muted">
              <div className="flex aspect-square items-center justify-center bg-[var(--fill)]">
                {asset.kind === "IMAGE" ? <ImageIcon className="size-6 text-[var(--ink4)]" /> : <Film className="size-6 text-[var(--ink4)]" />}
              </div>
              <div className="space-y-1 p-1.5">
                <p className="truncate text-[11px] text-[var(--ink3)]">{asset.label}</p>
                <span className={asset.placed ? "om-pill om-pill-good" : "om-pill"}>{asset.placed ? "Placed" : "Unplaced"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
