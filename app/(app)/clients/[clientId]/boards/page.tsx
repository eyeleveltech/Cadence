import { listMoodBoards } from "@/lib/actions/moodboards";
import { BoardsView } from "./boards-view";

export default async function BoardsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const boards = await listMoodBoards(clientId);

  return <BoardsView clientId={clientId} boards={boards} />;
}
