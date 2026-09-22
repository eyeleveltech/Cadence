import { demoLibraryForClient } from "@/lib/demo/data";
import { DemoLibraryGrid } from "./demo-library-grid";

export default async function DemoLibraryPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const assets = demoLibraryForClient(clientId);

  return (
    <div className="space-y-6 p-6">
      <DemoLibraryGrid assets={assets} />
    </div>
  );
}
