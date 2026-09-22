import { demoPostsForClient } from "@/lib/demo/data";
import { DemoPlanView } from "./demo-plan-view";

export default async function DemoPlanPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const posts = demoPostsForClient(clientId);

  return (
    <div className="p-6">
      <DemoPlanView posts={posts} />
    </div>
  );
}
