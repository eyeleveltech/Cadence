"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BriefcaseBusiness, LayoutGrid, Users, MessageSquareText } from "lucide-react";
import { cn } from "cn";
import { DEMO_CLIENTS } from "@/lib/demo/data";

const NAV_ITEMS = [
  { href: "/demo/planner", label: "Planner", icon: LayoutGrid },
  { href: "/demo/clients", label: "Clients", icon: BriefcaseBusiness },
  { href: "/demo/team", label: "Team", icon: Users },
  { href: "/demo/review", label: "Client review", icon: MessageSquareText },
];

export function DemoNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
        <span className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-[var(--ink3)]">
          <Bell className="size-4" />
          Notifications
        </span>
      </nav>

      <div className="flex flex-col gap-2">
        <div className="om-eyebrow px-2.5">Clients</div>
        <div className="flex flex-col gap-0.5">
          {DEMO_CLIENTS.map((client) => {
            const href = `/demo/clients/${client.id}/plan`;
            const active = pathname.startsWith(`/demo/clients/${client.id}`);
            return (
              <Link
                key={client.id}
                href={href}
                className={cn(
                  "flex h-7 items-center rounded-lg px-2.5 text-sm text-[var(--ink2)] transition-colors",
                  active
                    ? "border border-border bg-card font-medium text-foreground"
                    : "border border-transparent hover:bg-white/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{client.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
