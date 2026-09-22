"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/status-ring";
import type { DemoPost } from "@/lib/demo/data";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function DemoReviewQueue({ posts: initial }: { posts: DemoPost[] }) {
  const [posts, setPosts] = useState(initial);

  if (posts.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nothing waiting on you right now.</p>;
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <DemoReviewCard
          key={post.id}
          post={post}
          onAct={(status, comment) => {
            setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status, comments: [...p.comments, { id: `${Date.now()}`, author: "Dr Kavya Somesh (demo)", type: status === "APPROVED" ? "APPROVAL" : "REVISION_REQUEST", body: comment, at: new Date().toISOString() }] } : p)));
            toast.success(status === "APPROVED" ? "Approved" : "Revision requested");
          }}
        />
      ))}
    </div>
  );
}

function DemoReviewCard({ post, onAct }: { post: DemoPost; onAct: (status: "APPROVED" | "REVISION", comment: string) => void }) {
  const [comment, setComment] = useState("");
  const acted = post.status !== "CLIENT_REVIEW";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">{post.title}</p>
          <StatusChip status={post.status} />
        </div>
        {post.caption && <p className="whitespace-pre-wrap text-sm">{post.caption}</p>}

        {post.comments.length > 0 && (
          <div className="space-y-1.5 border-t pt-2">
            {post.comments.map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author}:</span> {c.body}
              </p>
            ))}
          </div>
        )}

        {!acted && (
          <>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Optional note…" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onAct("APPROVED", comment.trim() || "Approved")}>
                <Check className="size-3.5" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onAct("REVISION", comment.trim() || "Please revise")}>
                <RotateCcw className="size-3.5" /> Request changes
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
