"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function WorkspaceTabLink({
  clientId,
  segment,
  label,
}: {
  clientId: string;
  segment: string;
  label: string;
}) {
  const pathname = usePathname();
  const href = `/clients/${clientId}/${segment}`;
  const active = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-[0_1px_2px_rgba(21,22,23,0.06)]"
          : "text-[var(--ink3)] hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
