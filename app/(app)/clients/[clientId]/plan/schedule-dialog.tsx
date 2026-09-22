"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

/**
 * A post needs a time, not just a date.
 *
 * The calendar used to hand `createPost` a bare day, which resolved to
 * local midnight — so every post in the plan was scheduled for 00:00, the
 * deadest slot there is, with no way to say otherwise. The unscheduled
 * list was worse: a window.prompt taking "YYYY-MM-DD", which JavaScript
 * parses as *UTC* midnight, so the same "15 March" landed 5½ hours away
 * from the calendar's version of it.
 *
 * One control, one interpretation: a datetime-local value is always read
 * in the browser's own timezone, which is the one the person picking it
 * is thinking in.
 */

/** Most agencies post late morning; better than defaulting to midnight. */
const DEFAULT_HOUR = 10;

export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A day from the calendar grid, with a sensible hour filled in. */
export function defaultSlotFor(day: Date): Date {
  const slot = new Date(day);
  slot.setHours(DEFAULT_HOUR, 0, 0, 0);
  return slot;
}

export function ScheduleDialog({
  open, onOpenChange, title, initialDate, confirmLabel, busy, withTitle, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialDate: Date | null;
  confirmLabel: string;
  busy?: boolean;
  /** The create flow also needs a post title; rescheduling doesn't. */
  withTitle?: boolean;
  onConfirm: (values: { when: Date; title: string }) => void;
}) {
  const [postTitle, setPostTitle] = useState("");
  const [when, setWhen] = useState("");

  useEffect(() => {
    if (!open) return;
    setPostTitle("");
    setWhen(toLocalInputValue(initialDate ?? defaultSlotFor(new Date())));
  }, [open, initialDate]);

  const parsed = when ? new Date(when) : null;
  const valid =
    parsed !== null &&
    !Number.isNaN(parsed.getTime()) &&
    (!withTitle || postTitle.trim().length > 0);

  function submit() {
    if (!valid || !parsed) return;
    onConfirm({ when: parsed, title: postTitle.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {withTitle && (
            <div className="space-y-1.5">
              <Label htmlFor="post-title">What&apos;s the post about?</Label>
              <Input
                id="post-title"
                autoFocus
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="e.g. Onam offer carousel"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="post-when">Goes out at</Label>
            <Input
              id="post-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <p className="text-xs text-[var(--ink3)]">
              Your local time. The publisher fires at this exact minute.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
