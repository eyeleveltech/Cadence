import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DEMO_CLIENTS, DEMO_POSTS } from "@/lib/demo/data";

export default function DemoClientsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <p className="text-muted-foreground">Every retainer workspace in one place.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DEMO_CLIENTS.map((client) => {
          const count = DEMO_POSTS.filter((p) => p.clientId === client.id).length;
          return (
            <Link key={client.id} href={`/demo/clients/${client.id}/plan`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="font-semibold">{client.name}</p>
                    <p className="text-sm text-muted-foreground">{count} post{count === 1 ? "" : "s"}</p>
                  </div>
                  <span className="om-pill om-pill-good">{client.status}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
