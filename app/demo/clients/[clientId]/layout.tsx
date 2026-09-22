import Link from "next/link";
import { notFound } from "next/navigation";
import { demoClient } from "@/lib/demo/data";
import { DemoTabLink } from "@/components/demo/demo-tab-link";

const TABS = [
  { segment: "plan", label: "Plan" },
  { segment: "library", label: "Library" },
  { segment: "boards", label: "Boards" },
  { segment: "comms", label: "Comms" },
  { segment: "insights", label: "Insights" },
  { segment: "settings", label: "Settings" },
];

export default async function DemoClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = demoClient(clientId);
  if (!client) notFound();

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-8 pt-[26px]">
        <div>
          <Link href="/demo/clients" className="text-xs text-[var(--ink3)] hover:underline">← All clients</Link>
          <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">{client.name}</h1>
        </div>
        <nav className="mt-4 flex gap-5">
          {TABS.map((tab) => <DemoTabLink key={tab.segment} clientId={clientId} {...tab} />)}
        </nav>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
