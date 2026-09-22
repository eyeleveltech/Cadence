"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, LayoutGrid, Users } from "lucide-react";
import { cn } from "cn";
import { NotificationsBell } from "@/components/notifications-bell";

const NAV_ITEMS = [
  { href: "/planner", label: "Planner", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: BriefcaseBusiness },
];

const LEADERSHIP_ITEM = { href: "/team", label: "Team", icon: Users };

export function AppNav({
  clients,
  isLeadership,
}: {
  clients: { id: string; name: string }[];
  isLeadership: boolean;
}) {
  const pathname = usePathname();
  const items = isLeadership ? [...NAV_ITEMS, LEADERSHIP_ITEM] : NAV_ITEMS;

  return (
    <>
      <nav className="flex shrink-0 flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-sm font-medium text-[var(--ink2)] transition-colors",
                active
                  ? "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.04)]"
                  : "hover:bg-white/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </Link>
          );
        })}
        <NotificationsBell />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain border-t border-border pt-4">
        <div className="om-eyebrow shrink-0 px-2.5">Clients</div>
        <div className="flex flex-col gap-0.5">
          {clients.map((client) => {
            const active = pathname.startsWith(`/clients/${client.id}`);
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}/plan`}
                className={cn(
                  "flex h-7 items-center rounded-lg px-2.5 text-sm text-[var(--ink2)] transition-colors",
                  active
                    ? "border border-border bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.04)]"
                    : "border border-transparent hover:bg-white/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{client.name}</span>
              </Link>
            );
          })}
          {clients.length === 0 && (
            <p className="px-2.5 text-xs text-[var(--ink3)]">No clients assigned yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
