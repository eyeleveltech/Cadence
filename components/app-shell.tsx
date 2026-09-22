import { requireUser } from "@/lib/session";
import { listClientsForCurrentUser } from "@/lib/actions/clients";
import { ROLE_LABELS } from "@/lib/roles";
import { SignOutButton } from "@/components/sign-out-button";
import { AppNav } from "@/components/app-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, clients] = await Promise.all([requireUser(), listClientsForCurrentUser()]);
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex h-full w-[216px] shrink-0 flex-col gap-5 px-3.5 py-4.5">
        <div className="flex h-6 shrink-0 items-center gap-2 px-1.5">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" fill="none" stroke="var(--ring-track)" strokeWidth="2.6" />
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="2.6"
              strokeDasharray="29.91 43.98"
              transform="rotate(-90 10 10)"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Cadence</span>
          <span className="om-mono ml-auto text-[var(--ink4)]">EYELEVEL</span>
        </div>

        <AppNav clients={clients} isLeadership={user.role === "ADMIN" || user.role === "MANAGER"} />

        <div className="mt-auto flex shrink-0 items-center gap-2.5 rounded-lg border border-transparent px-1.5 py-1.5 transition-colors hover:border-border hover:bg-card">
          <Avatar className="size-7 border border-border bg-white">
            <AvatarFallback className="bg-transparent text-[10px] font-semibold text-[var(--ink2)]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-[15px]">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="om-mono text-[var(--ink3)]">{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}</span>
          </div>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="my-2.5 mr-2.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(21,22,23,0.04),0_8px_24px_-16px_rgba(21,22,23,0.08)]">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">{children}</div>
      </main>
    </div>
  );
}
