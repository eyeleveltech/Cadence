"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientStatus } from "@prisma/client";
import { setClientStatus, deleteClient } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const STATUS_HELP: Record<ClientStatus, string> = {
  ACTIVE: "Everything on, posts publish as scheduled.",
  PAUSED: "Retainer on hold — the workspace stays, nothing is deleted.",
  CHURNED: "Closed. Keep the history, stop the work.",
};

export function ClientAdmin({
  clientId, clientName, status, isAdmin,
}: {
  clientId: string;
  clientName: string;
  status: ClientStatus;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<ClientStatus>(status);
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [open, setOpen] = useState(false);

  async function handleStatus(next: ClientStatus | null) {
    if (!next || next === current) return;
    const previous = current;
    setCurrent(next);
    setBusy(true);
    try {
      await setClientStatus({ clientId, status: next });
      toast.success(`Client marked ${next.toLowerCase()}`);
      router.refresh();
    } catch (err) {
      setCurrent(previous);
      toast.error(err instanceof Error ? err.message : "Couldn't change the status");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteClient({ clientId, confirmName });
      toast.success(`${clientName} deleted`);
      router.push("/clients");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the client");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="client-status">Status</Label>
        <Select value={current} onValueChange={handleStatus} disabled={busy}>
          <SelectTrigger id="client-status" className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="CHURNED">Churned</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-[var(--ink3)]">{STATUS_HELP[current]}</p>
      </div>

      {isAdmin && (
        <div className="border-t border-border pt-5">
          <p className="text-sm font-medium">Delete this client</p>
          <p className="mt-0.5 text-xs text-[var(--ink3)]">
            Removes the workspace and everything in it — posts, library, boards and the comms log.
            Pausing keeps all of it. There is no undo.
          </p>

          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmName(""); }}>
            <DialogTrigger
              render={<Button variant="destructive" size="sm" className="mt-3">Delete client</Button>}
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {clientName}?</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-sm text-[var(--ink2)]">
                  Every post, asset, mood board and comms entry for this client is deleted with it.
                </p>
                <Label htmlFor="confirm-name">
                  Type <span className="font-semibold">{clientName}</span> to confirm
                </Label>
                <Input
                  id="confirm-name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={busy || confirmName.trim() !== clientName}
                >
                  {busy ? "Deleting…" : "Delete permanently"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
