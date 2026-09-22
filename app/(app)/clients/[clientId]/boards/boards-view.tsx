"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { listMoodBoards } from "@/lib/actions/moodboards";
import {
  createMoodBoard, addMoodBoardUrlItem, addMoodBoardTextItem, deleteMoodBoardItem,
} from "@/lib/actions/moodboards";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Link2, Type, ImageOff, ExternalLink, Trash2, Sparkles } from "lucide-react";
import { cn } from "cn";

type Board = Awaited<ReturnType<typeof listMoodBoards>>[number];
type BoardItem = Board["items"][number];

export function BoardsView({ clientId, boards }: { clientId: string; boards: Board[] }) {
  const router = useRouter();
  const [activeBoardId, setActiveBoardId] = useState(boards[0]?.id);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const board = boards.find((b) => b.id === activeBoardId);
  const tags = useMemo(() => [...new Set((board?.items ?? []).flatMap((i) => i.moodTags))], [board]);
  const visibleItems = board ? (activeTag ? board.items.filter((i) => i.moodTags.includes(activeTag)) : board.items) : [];

  async function handleCreateBoard() {
    if (!newBoardName.trim()) return;
    const created = await createMoodBoard({ clientId, name: newBoardName.trim() });
    setNewBoardName("");
    setNewBoardOpen(false);
    setActiveBoardId(created.id);
    router.refresh();
  }

  async function handleDeleteItem(itemId: string) {
    if (!window.confirm("Remove this reference?")) return;
    try {
      await deleteMoodBoardItem(clientId, itemId);
      toast.success("Removed");
      router.refresh();
    } catch {
      toast.error("Couldn't remove that reference");
    }
  }

  if (boards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 py-16 text-center">
        <p className="text-muted-foreground">No mood boards yet for this client.</p>
        <NewBoardDialog open={newBoardOpen} onOpenChange={setNewBoardOpen} name={newBoardName} setName={setNewBoardName} onCreate={handleCreateBoard} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {boards.length > 1 && (
        <div className="inline-flex gap-1 rounded-lg bg-[var(--fill)] p-1">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => { setActiveBoardId(b.id); setActiveTag(null); }}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
                b.id === activeBoardId ? "bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.06)]" : "text-[var(--ink3)] hover:text-foreground",
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLightboxOpen(true)} disabled={visibleItems.length === 0}>
            <Sparkles className="size-4" /> Launch visuals
          </Button>
          <NewBoardDialog open={newBoardOpen} onOpenChange={setNewBoardOpen} name={newBoardName} setName={setNewBoardName} onCreate={handleCreateBoard} trigger={<Plus className="size-4" />} label="New board" variant="outline" />
        </div>
        {board && <AddReferenceDialog clientId={clientId} board={board} open={addOpen} onOpenChange={setAddOpen} />}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setActiveTag(null)} className={cn("om-pill", !activeTag && "om-pill-solid")}>All</button>
          {tags.map((tag) => (
            <button key={tag} onClick={() => setActiveTag(tag)} className={cn("om-pill", activeTag === tag && "om-pill-solid")}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {board && board.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Empty board — add the first reference above.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => (
            <ItemCard key={item.id} item={item} onDelete={() => handleDeleteItem(item.id)} />
          ))}
        </div>
      )}

      {lightboxOpen && <Lightbox items={visibleItems} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}

function ItemCard({ item, onDelete }: { item: BoardItem; onDelete: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative flex aspect-[4/5] items-center justify-center bg-[var(--fill)]">
        {item.thumbnailUrl ? (
          <Image src={item.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
        ) : item.type === "TEXT" ? (
          <p className="p-4 text-sm italic text-[var(--ink2)] line-clamp-6">{item.title}</p>
        ) : (
          <ImageOff className="size-6 text-[var(--ink4)]" />
        )}
      </div>
      <div className="space-y-2 p-4">
        {item.type !== "TEXT" && <p className="font-medium">{item.title ?? item.sourceUrl}</p>}
        {item.moodTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.moodTags.map((tag) => <span key={tag} className="om-pill">{tag}</span>)}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          {item.sourceUrl ? (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="size-3.5" /> Open source
            </a>
          ) : <span />}
          <button onClick={onDelete} className="flex size-7 items-center justify-center rounded-md text-[var(--ink3)] transition-colors hover:bg-muted hover:text-destructive">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ items, onClose }: { items: BoardItem[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Visuals</DialogTitle></DialogHeader>
        <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {items.filter((i) => i.thumbnailUrl).map((item) => (
            <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-[var(--fill)]">
              <Image src={item.thumbnailUrl!} alt="" fill className="object-cover" unoptimized />
            </div>
          ))}
          {items.every((i) => !i.thumbnailUrl) && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Nothing with an image to show yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewBoardDialog({
  open, onOpenChange, name, setName, onCreate, trigger, label, variant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  onCreate: () => void;
  trigger?: React.ReactNode;
  label?: string;
  variant?: "outline" | "default";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size={label ? "default" : "sm"} variant={variant ?? "outline"}>
            {trigger ?? <Plus className="size-4" />} {label ?? "New Board"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader><DialogTitle>New mood board</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="board-name">Name</Label>
          <Input id="board-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TNPPL Season 2" />
        </div>
        <DialogFooter>
          <Button onClick={onCreate} disabled={!name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddReferenceDialog({
  clientId, board, open, onOpenChange,
}: {
  clientId: string;
  board: Board;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    const moodTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      if (mode === "url") {
        if (!url.trim()) return;
        await addMoodBoardUrlItem({ clientId, moodBoardId: board.id, sourceUrl: url.trim(), moodTags });
      } else {
        if (!text.trim()) return;
        await addMoodBoardTextItem({ clientId, moodBoardId: board.id, title: text.trim(), moodTags });
      }
      setUrl("");
      setText("");
      setTags("");
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Couldn't add that reference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button><Plus className="size-4" /> Add reference</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Add to {board.name}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "url" ? "default" : "outline"} onClick={() => setMode("url")}>
            <Link2 className="size-3.5" /> URL
          </Button>
          <Button size="sm" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")}>
            <Type className="size-3.5" /> Text note
          </Button>
        </div>
        {mode === "url" ? (
          <div className="space-y-1.5">
            <Label htmlFor="ref-url">Pinterest, Instagram, YouTube — any link</Label>
            <Input id="ref-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pinterest.com/pin/…" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="ref-text">Note</Label>
            <Textarea id="ref-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. keep the tone playful, like the Onam campaign captions" rows={3} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ref-tags">Mood tags (comma-separated)</Label>
          <Input id="ref-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bold, minimal, festive" />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={saving}>{saving ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
