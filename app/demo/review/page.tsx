import { DEMO_POSTS } from "@/lib/demo/data";
import { DemoReviewQueue } from "./demo-review-queue";

export default function DemoReviewPage() {
  const posts = DEMO_POSTS.filter((p) => p.status === "CLIENT_REVIEW");
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold tracking-tight">Posts for your review</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Approve, request changes, or leave a comment — right from your phone. This is what a client reviewer sees.
      </p>
      <DemoReviewQueue posts={posts} />
    </div>
  );
}
