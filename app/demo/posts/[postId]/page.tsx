import { notFound } from "next/navigation";
import { demoPost, demoClient } from "@/lib/demo/data";
import { DemoPostEditor } from "./demo-post-editor";

export default async function DemoPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const post = demoPost(postId);
  if (!post) notFound();
  const client = demoClient(post.clientId)!;

  return <DemoPostEditor post={post} clientName={client.name} />;
}
