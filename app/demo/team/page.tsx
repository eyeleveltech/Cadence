import { DEMO_USERS, DEMO_CLIENTS, DEMO_POSTS } from "@/lib/demo/data";
import { ROLE_LABELS } from "@/lib/roles";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format, subDays } from "date-fns";

export default function DemoTeamPage() {
  return (
    <div className="space-y-6 px-8 pt-[26px] pb-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] leading-7">Team</h1>
        <p className="mt-1 text-sm text-[var(--ink3)]">
          Every account and its role — the hierarchy that decides what each person can see.
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="om-eyebrow border-b border-border pb-2.5 text-left">Name</th>
            <th className="om-eyebrow border-b border-border pb-2.5 text-left">Role</th>
            <th className="om-eyebrow border-b border-border pb-2.5 text-left">Clients</th>
            <th className="om-eyebrow border-b border-border pb-2.5 text-left">Joined</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_USERS.map((u, i) => {
            const clientCount = DEMO_CLIENTS.filter((c) => DEMO_POSTS.some((p) => p.clientId === c.id && (p.assignedDesigner === u.name || p.assignedWriter === u.name))).length;
            return (
              <tr key={u.id} className="group">
                <td className="h-12 border-b border-[var(--row-hairline)] pr-4 group-hover:bg-[var(--fill)]">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7 border border-border bg-background">
                      <AvatarFallback className="bg-transparent text-[10px] font-semibold text-[var(--ink2)]">{u.initials}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="h-12 border-b border-[var(--row-hairline)] pr-4 group-hover:bg-[var(--fill)]">
                  <span className="om-pill">{ROLE_LABELS[u.role]}</span>
                </td>
                <td className="om-num h-12 border-b border-[var(--row-hairline)] pr-4 text-[var(--ink3)] group-hover:bg-[var(--fill)]">{clientCount}</td>
                <td className="om-mono h-12 border-b border-[var(--row-hairline)] pr-4 text-[var(--ink3)] group-hover:bg-[var(--fill)]">
                  {format(subDays(new Date(), 200 - i * 12), "d MMM yyyy")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
