import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  // Client reviewers only ever see /review — the internal planner, client
  // list and workspace tabs would expose drafts and other clients' work.
  const session = await getSession();
  if (session?.user.role === "CLIENT_REVIEWER") {
    redirect("/review");
  }

  return <AppShell>{children}</AppShell>;
}
