import { Info } from "lucide-react";
import { listMediaAssets } from "@/lib/actions/media";
import { LibraryUploader } from "./library-uploader";
import { LibraryGrid } from "./library-grid";

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const assets = await listMediaAssets(clientId);

  return (
    <div className="space-y-4 p-6">
      <LibraryUploader clientId={clientId} />
      <div className="flex items-center gap-2 rounded-xl bg-[var(--fill)] px-4 py-2.5 text-sm text-[var(--ink3)]">
        <Info className="size-4 shrink-0" />
        Images convert to a platform-safe format automatically; a Story crop is generated on upload.
      </div>
      <LibraryGrid clientId={clientId} assets={assets} />
    </div>
  );
}
