import { listPostsForClient } from "@/lib/actions/posts";
import { PlanView } from "./plan-view";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const posts = await listPostsForClient(clientId);

  return (
    <div className="p-6">
      <PlanView clientId={clientId} posts={posts} />
    </div>
  );
}
