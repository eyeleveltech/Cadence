"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { listAllUsers, updateUserRole, inviteTeamMember } from "@/lib/actions/team";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type User = Awaited<ReturnType<typeof listAllUsers>>[number];

type TeamRole = Exclude<Role, "CLIENT_REVIEWER">;
const TEAM_ROLES: TeamRole[] = ["ADMIN", "MANAGER", "WRITER", "DESIGNER"];

export function TeamRoster({
  users,
  currentUser,
}: {
  users: User[];
  currentUser: { id: string; role: string };
}) {
  const router = useRouter();
  const isAdmin = currentUser.role === "ADMIN";
  const [inviteOpen, setInviteOpen] = useState(false);

  const handleRoleChange = useCallback(async (userId: string, role: TeamRole) => {
    try {
      await updateUserRole({ userId, role });
      toast.success("Role updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update role");
    }
  }, [router]);

  return (
    <div className="space-y-2">
      {isAdmin && (
        <div className="flex justify-end">
          <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={() => router.refresh()} />
        </div>
      )}
      {users.map((user) => {
        const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
        return (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-xl border border-border p-3.5"
          >
            <div className="flex items-center gap-2.5">
              <Avatar className="size-8 border border-border bg-background">
                <AvatarFallback className="bg-transparent text-xs font-semibold text-[var(--ink2)]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col leading-[17px]">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="om-mono text-[var(--ink3)]">{user.email}</span>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <span className="text-sm text-[var(--ink3)]">
                <span className="om-num">{user._count.clientMemberships}</span> client{user._count.clientMemberships === 1 ? "" : "s"}
              </span>
              <span className="om-mono hidden text-[var(--ink4)] sm:inline">
                Joined {format(user.createdAt, "d MMM yyyy")}
              </span>
              {isAdmin ? (
                <Select items={ROLE_LABELS} value={user.role} onValueChange={(v) => v && handleRoleChange(user.id, v as TeamRole)}>
                  <SelectTrigger className="h-8 w-[136px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <span className="om-pill">{ROLE_LABELS[user.role]}</span>
              )}
            </div>
          </div>
        );
      })}
      {users.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-[var(--ink3)]">
          No one is on the team yet.
        </p>
      )}
    </div>
  );
}

function InviteDialog({
  open, onOpenChange, onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("WRITER");
  const [saving, setSaving] = useState(false);

  async function handleInvite() {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      const res = await inviteTeamMember({ name: name.trim(), email: email.trim(), role });
      if (res?.tempPassword) {
        toast.success(`Invited ${name.trim()}! Temp password: ${res.tempPassword}`, { duration: 15000 });
      } else {
        toast.success(`Invited ${name.trim()} — sign-in details sent`);
      }
      setName("");
      setEmail("");
      setRole("WRITER");
      onOpenChange(false);
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm"><Plus className="size-4" /> Invite team member</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Invite a team member</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@eyelevelstudio.in" />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select items={ROLE_LABELS} value={role} onValueChange={(v) => v && setRole(v as TeamRole)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEAM_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={handleInvite} disabled={saving || !name.trim() || !email.trim()}>
            {saving ? "Inviting…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
