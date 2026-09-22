import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram, Facebook, Linkedin, Youtube } from "lucide-react";
import { demoClient, DEMO_USERS } from "@/lib/demo/data";
import { ROLE_LABELS } from "@/lib/roles";
import { notFound } from "next/navigation";
import { DemoConnectButton } from "./demo-connect-button";

const PLATFORM_ICON = { INSTAGRAM: Instagram, FACEBOOK: Facebook, LINKEDIN: Linkedin, YOUTUBE: Youtube } as const;
const TEAM = DEMO_USERS.filter((u) => u.role !== "ADMIN").slice(0, 3);

export default async function DemoSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = demoClient(clientId);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Brand Kit</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Tone of voice:</span> {client.toneOfVoice}</p>
          <p><span className="text-muted-foreground">Status:</span> {client.status}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Connected Platform Accounts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(["INSTAGRAM", "FACEBOOK", "LINKEDIN", "YOUTUBE"] as const).map((platform) => {
            const Icon = PLATFORM_ICON[platform];
            return (
              <div key={platform} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="text-sm font-medium">{platform}</span>
                </div>
                <DemoConnectButton />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            OAuth connect flows go live once Meta App Review, LinkedIn Community Management vetting
            and Google verification clear.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {TEAM.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm">
              <p className="font-medium">{u.name}</p>
              <span className="om-pill">{ROLE_LABELS[u.role]}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
