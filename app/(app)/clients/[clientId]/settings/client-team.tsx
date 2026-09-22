"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { addClientMember } from "@/lib/actions/clients";
import { inviteClientReviewer, removeClientMember } from "@/lib/actions/team";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

type Member = { userId: string; name: string; email: string; role: Role };
type OrgUser = { id: string; name: string; email: string; role: Role };

export function ClientTeam({
  clientId,
  members,
  isLeadership,
  orgUsers,
}: {
  clientId: string;
  members: Member[];
  isLeadership: boolean;
  orgUsers: OrgUser[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const memberIds = new Set(members.map((m) => m.userId));
  const available = orgUsers.filter((u) => u.role !== "CLIENT_REVIEWER" && !memberIds.has(u.id));

  async function handleRemove(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this client?`)) return;
    try {
      await removeClientMember({ clientId, userId });
      toast.success("Removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove");
    }
  }

  return (
    <div className="space-y-2">
      {isLeadership && (
        <div className="flex justify-end">
          <AddMemberDialog
            open={open}
            onOpenChange={setOpen}
            clientId={clientId}
            available={available}
            onChanged={() => router.refresh()}
          />
        </div>
      )}
      {members.length === 0 && <p className="text-sm text-muted-foreground">No one is assigned to this client yet.</p>}
      {members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between rounded-xl border border-border p-3.5 text-sm">
          <div>
            <p className="font-medium">{m.name}</p>
            <p className="text-xs text-muted-foreground">{m.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="om-pill">{ROLE_LABELS[m.role]}</span>
            {isLeadership && (
              <button
                onClick={() => handleRemove(m.userId, m.name)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                title={`Remove ${m.name}`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddMemberDialog({
  open, onOpenChange, clientId, available, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  available: OrgUser[];
  onChanged: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddExisting() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await addClientMember({ clientId, userId: selectedUserId });
      toast.success("Added");
      setSelectedUserId("");
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add");
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteReviewer() {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await inviteClientReviewer({ clientId, name: name.trim(), email: email.trim() });
      toast.success(`${name.trim()} can now sign in and review this client's content`);
      setName("");
      setEmail("");
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm"><Plus className="size-4" /> Add member</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Add to this client</DialogTitle></DialogHeader>
        <Tabs defaultValue="existing">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Team member</TabsTrigger>
            <TabsTrigger value="client">Client access</TabsTrigger>
          </TabsList>
          <TabsContent value="existing" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Someone already on Cadence</Label>
              <Select
                items={Object.fromEntries(available.map((u) => [u.id, `${u.name} · ${ROLE_LABELS[u.role]}`]))}
                value={selectedUserId}
                onValueChange={(v) => v && setSelectedUserId(v)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>
                  {available.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {ROLE_LABELS[u.role]}</SelectItem>)}
                  {available.length === 0 && <SelectItem value="none" disabled>Everyone eligible is already on this client</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={handleAddExisting} disabled={saving || !selectedUserId}>
                {saving ? "Adding…" : "Add"}
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="client" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Creates a client-reviewer account scoped to this client only — magic-link sign-in, no password.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reviewer-name">Name</Label>
              <Input id="reviewer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Kavya Somesh" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reviewer-email">Email</Label>
              <Input id="reviewer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their email" />
            </div>
            <DialogFooter>
              <Button onClick={handleInviteReviewer} disabled={saving || !name.trim() || !email.trim()}>
                {saving ? "Inviting…" : "Grant access"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
