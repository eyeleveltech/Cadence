import Link from "next/link";
import { listClientsForCurrentUser } from "@/lib/actions/clients";
import { requireUser } from "@/lib/session";
import { NewClientDialog } from "./new-client-dialog";

export default async function ClientsPage() {
  const [clients, user] = await Promise.all([listClientsForCurrentUser(), requireUser()]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-[var(--ink3)]">Every retainer workspace in one place.</p>
        </div>
        {user.role === "ADMIN" && <NewClientDialog />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {clients.map((client) => (
          <Link
            key={client.id}
            href={`/clients/${client.id}/plan`}
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-[var(--ink4)]"
          >
            <div>
              <p className="text-lg font-semibold">{client.name}</p>
              <p className="text-sm text-[var(--ink3)]">
                {client._count.posts} post{client._count.posts === 1 ? "" : "s"}
              </p>
            </div>
            <span className={client.status === "ACTIVE" ? "om-pill om-pill-solid" : "om-pill"}>
              {client.status}
            </span>
          </Link>
        ))}
        {clients.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-[var(--ink3)]">
            No clients yet.
          </p>
        )}
      </div>
    </div>
  );
}
