"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function DemoTabLink({ clientId, segment, label }: { clientId: string; segment: string; label: string }) {
  const pathname = usePathname();
  const href = `/demo/clients/${clientId}/${segment}`;
  const active = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors",
        active ? "border-foreground text-foreground" : "border-transparent text-[var(--ink3)] hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
