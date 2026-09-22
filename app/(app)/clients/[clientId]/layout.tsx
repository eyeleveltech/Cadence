import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientWorkspaceAccess } from "@/lib/session";
import { WorkspaceTabLink } from "./workspace-tab-link";

const TABS = [
  { segment: "plan", label: "Plan" },
  { segment: "library", label: "Library" },
  { segment: "boards", label: "Boards" },
  { segment: "comms", label: "Comms" },
  { segment: "insights", label: "Insights" },
  { segment: "settings", label: "Settings" },
];

export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  await requireClientWorkspaceAccess(clientId);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) notFound();

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-[26px] pb-5">
        <Link href="/clients" className="text-xs text-[var(--ink3)] hover:underline">
          ← All clients
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">{client.name}</h1>
          <span className={`om-pill ${client.status === "ACTIVE" ? "om-pill-solid" : ""}`}>
            {client.status === "ACTIVE" ? "Active" : client.status === "PAUSED" ? "Paused" : "Churned"}
          </span>
        </div>
        <nav className="mt-5 inline-flex gap-1 rounded-lg bg-[var(--fill)] p-1">
          {TABS.map((tab) => (
            <WorkspaceTabLink key={tab.segment} clientId={clientId} {...tab} />
          ))}
        </nav>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
