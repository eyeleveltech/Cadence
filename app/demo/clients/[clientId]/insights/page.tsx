import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { demoPostsForClient } from "@/lib/demo/data";

export default async function DemoInsightsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const publishedCount = demoPostsForClient(clientId).filter((p) => p.status === "PUBLISHED").length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <BarChart3 className="size-8 text-muted-foreground" />
          <p className="font-medium">Analytics arrive once publishing goes live</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {publishedCount === 0
              ? "This client has no published posts yet. Once platform connections are approved and the first post publishes, performance data pulls in automatically 24 hours later."
              : `${publishedCount} post${publishedCount === 1 ? "" : "s"} published so far.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
