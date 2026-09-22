import { listCommLogs } from "@/lib/actions/comms";
import { requireClientWorkspaceAccess } from "@/lib/session";
import { CommsView } from "./comms-view";

export default async function CommsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const [entries, currentUser] = await Promise.all([
    listCommLogs(clientId),
    requireClientWorkspaceAccess(clientId),
  ]);
  const isLeadership = currentUser.role === "ADMIN" || currentUser.role === "MANAGER";

  return <CommsView clientId={clientId} entries={entries} isLeadership={isLeadership} />;
}
