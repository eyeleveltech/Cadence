import { demoBoardsForClient } from "@/lib/demo/data";
import { DemoBoardsView } from "./demo-boards-view";

export default async function DemoBoardsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const boards = demoBoardsForClient(clientId);

  return (
    <div className="p-6">
      <DemoBoardsView boards={boards} />
    </div>
  );
}
