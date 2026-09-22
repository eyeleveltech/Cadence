"use client";

import { useState } from "react";
import Link from "next/link";
import { Instagram, Facebook, Linkedin, Youtube, Check, RotateCcw } from "lucide-react";
import type { Platform, PostStatus } from "@prisma/client";
import type { DemoPost } from "@/lib/demo/data";
import { POST_STATUS_LABELS, POST_STATUS_ADVANCE_SEQUENCE } from "@/lib/roles";
import { StatusChip } from "@/components/status-ring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const PLATFORMS: { value: Platform; label: string; icon: typeof Instagram }[] = [
  { value: "INSTAGRAM", label: "Instagram", icon: Instagram },
  { value: "FACEBOOK", label: "Facebook", icon: Facebook },
  { value: "LINKEDIN", label: "LinkedIn", icon: Linkedin },
  { value: "YOUTUBE", label: "YouTube", icon: Youtube },
];

export function DemoPostEditor({ post: initial, clientName }: { post: DemoPost; clientName: string }) {
  const [post, setPost] = useState(initial);
  const [caption, setCaption] = useState(initial.caption);
  const [hashtagsRaw, setHashtagsRaw] = useState(initial.hashtags.join(", "));
  const [commentBody, setCommentBody] = useState("");

  const advanceIndex = POST_STATUS_ADVANCE_SEQUENCE.indexOf(post.status);
  const nextStatus: PostStatus | null =
    advanceIndex >= 0 && advanceIndex < POST_STATUS_ADVANCE_SEQUENCE.length - 1
      ? POST_STATUS_ADVANCE_SEQUENCE[advanceIndex + 1]
      : null;

  function saveNotice() {
    toast("This is a demo — changes aren't saved.");
  }

  function handleAdvance() {
    if (!nextStatus) return;
    setPost((p) => ({ ...p, status: nextStatus }));
    saveNotice();
  }

  function handleComment(type: "COMMENT" | "APPROVAL" | "REVISION_REQUEST") {
    const body = type === "COMMENT" ? commentBody : commentBody || (type === "APPROVAL" ? "Approved" : "Please revise");
    if (!body.trim()) return;
    setPost((p) => ({
      ...p,
      comments: [...p.comments, { id: `demo-${Date.now()}`, author: "Akmal Rahman", type, body, at: new Date().toISOString() }],
      status: type === "APPROVAL" ? "APPROVED" : type === "REVISION_REQUEST" ? "REVISION" : p.status,
    }));
    setCommentBody("");
    saveNotice();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href={`/demo/clients/${post.clientId}/plan`} className="text-xs text-muted-foreground hover:underline">← {clientName}</Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">{post.title}</h1>
          <div className="flex items-center gap-2">
            <StatusChip status={post.status} />
            {nextStatus && (
              <Button size="sm" variant="outline" onClick={handleAdvance}>
                Advance → {POST_STATUS_LABELS[nextStatus]}
              </Button>
            )}
          </div>
        </div>
        {post.brief && <p className="mt-1 text-sm text-muted-foreground">{post.brief}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Platforms</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={post.platforms.includes(value) ? "default" : "outline"}
                    onClick={() => {
                      setPost((p) => ({
                        ...p,
                        platforms: p.platforms.includes(value) ? p.platforms.filter((x) => x !== value) : [...p.platforms, value],
                      }));
                    }}
                  >
                    <Icon className="size-3.5" /> {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Caption</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} placeholder="Write the caption…" />
              <p className="text-right text-xs text-muted-foreground">{caption.length} / 2200</p>
              <div className="space-y-1.5">
                <Label htmlFor="demo-hashtags">Hashtags (comma-separated)</Label>
                <Input id="demo-hashtags" value={hashtagsRaw} onChange={(e) => setHashtagsRaw(e.target.value)} />
              </div>
              <Button onClick={saveNotice}>Save changes</Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Designer:</span> {post.assignedDesigner ?? "Unassigned"}</p>
              <p><span className="text-muted-foreground">Writer:</span> {post.assignedWriter ?? "Unassigned"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Approval Thread</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {post.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                {post.comments.map((c) => (
                  <div key={c.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.author}</span>
                    </div>
                    {c.type !== "COMMENT" && (
                      <span className={`om-pill ${c.type === "APPROVAL" ? "om-pill-good" : "om-pill-bad"} my-1`}>
                        {c.type === "APPROVAL" ? "Approved" : "Revision requested"}
                      </span>
                    )}
                    <p>{c.body}</p>
                  </div>
                ))}
              </div>
              <Textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} rows={2} placeholder="Add a comment…" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleComment("COMMENT")} disabled={!commentBody.trim()}>Comment</Button>
                <Button size="sm" onClick={() => handleComment("APPROVAL")}><Check className="size-3.5" /> Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => handleComment("REVISION_REQUEST")}><RotateCcw className="size-3.5" /> Request Revision</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
