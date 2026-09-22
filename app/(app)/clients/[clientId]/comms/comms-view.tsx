"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { listCommLogs } from "@/lib/actions/comms";
import { createCommLog, deleteCommLog } from "@/lib/actions/comms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COMM_TYPE_LABELS, ROLE_LABELS } from "@/lib/roles";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { CommType } from "@prisma/client";

type Entry = Awaited<ReturnType<typeof listCommLogs>>[number];

const TYPES: CommType[] = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "BRIEF_UPDATE"];

export function CommsView({ clientId, entries, isLeadership }: { clientId: string; entries: Entry[]; isLeadership: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CommType>("WHATSAPP");
  const [summary, setSummary] = useState("");
  const [actionItemsRaw, setActionItemsRaw] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!summary.trim()) return;
    setSaving(true);
    try {
      await createCommLog({
        clientId,
        type,
        summary: summary.trim(),
        actionItems: actionItemsRaw.split("\n").map((l) => l.trim()).filter(Boolean),
        occurredAt: new Date(occurredAt),
      });
      setSummary("");
      setActionItemsRaw("");
      setOpen(false);
      router.refresh();
      toast.success("Logged");
    } catch {
      toast.error("Couldn't save that entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!window.confirm("Delete this log entry? This can't be undone.")) return;
    try {
      await deleteCommLog(clientId, entryId);
      toast.success("Deleted");
      router.refresh();
    } catch {
      toast.error("Couldn't delete — admin or manager access required");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Communication log</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="size-4" /> Log entry</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Log a communication</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={type === t ? "default" : "outline"}
                    onClick={() => setType(t)}
                  >
                    {COMM_TYPE_LABELS[t]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="occurred-at">When</Label>
              <Input
                id="occurred-at"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="What was discussed"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="action-items">Action items (one per line)</Label>
              <Textarea
                id="action-items"
                value={actionItemsRaw}
                onChange={(e) => setActionItemsRaw(e.target.value)}
                rows={3}
                placeholder={"Send revised captions by Friday\nConfirm shoot date"}
              />
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={saving || !summary.trim()}>
                {saving ? "Saving…" : "Save entry"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {entries.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing logged yet — the first call or WhatsApp update starts the record.
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="om-pill">{COMM_TYPE_LABELS[entry.type]}</span>
                <span className="text-sm text-[var(--ink3)]">{format(entry.occurredAt, "d MMM yyyy, HH:mm")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--ink3)]">
                  logged by {entry.loggedBy.name} ({ROLE_LABELS[entry.loggedBy.role]})
                </span>
                {isLeadership && (
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--ink3)] transition-colors hover:bg-muted hover:text-destructive"
                    title="Delete entry"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm">{entry.summary}</p>
            {entry.actionItems.length > 0 && (
              <ul className="mt-3 space-y-2 rounded-xl bg-[var(--fill)] p-3.5">
                {entry.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--ink2)]">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--status-warn)]" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
