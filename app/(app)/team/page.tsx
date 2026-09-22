import { requireRole } from "@/lib/session";
import { listAllUsers } from "@/lib/actions/team";
import { TeamRoster } from "./team-roster";

export default async function TeamPage() {
  const currentUser = await requireRole("ADMIN", "MANAGER");
  const users = await listAllUsers();

  return (
    <div className="space-y-6 px-8 pt-[26px] pb-8">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Team</h1>
        <p className="mt-1 text-sm text-[var(--ink3)]">
          Every account and its role — the hierarchy that decides what each person can see.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <TeamRoster users={users} currentUser={{ id: currentUser.id, role: currentUser.role }} />
      </div>
    </div>
  );
}
