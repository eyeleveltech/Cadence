"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DemoConnectButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => toast("Demo mode — real connections happen after you sign in.")}>
      Connect
    </Button>
  );
}
