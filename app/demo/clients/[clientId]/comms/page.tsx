import { demoCommsForClient } from "@/lib/demo/data";
import { DemoCommsView } from "./demo-comms-view";

export default async function DemoCommsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const entries = demoCommsForClient(clientId);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <DemoCommsView entries={entries} />
    </div>
  );
}
