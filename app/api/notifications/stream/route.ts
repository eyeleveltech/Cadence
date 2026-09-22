import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 4000;

/**
 * Push channel for the notification bell. Polls the DB rather than
 * subscribing to Redis pub/sub — simplest thing that's actually correct
 * for this traffic level (a handful of staff, a few events an hour).
 * Swap the poll loop for a Redis subscriber later without touching the
 * client, which only cares about the `data: {...}` shape below.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  let closed = false;
  let lastSignature = "";
  let interval: ReturnType<typeof setInterval>;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;
        const [unread, latest] = await Promise.all([
          prisma.notification.count({ where: { userId, read: false } }),
          prisma.notification.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } }),
        ]);
        const signature = `${unread}:${latest?.id ?? ""}`;
        if (signature !== lastSignature) {
          lastSignature = signature;
          send({ unread });
        }
      };

      send({ unread: await prisma.notification.count({ where: { userId, read: false } }) });
      interval = setInterval(tick, POLL_MS);
      // Keep the connection alive through idle proxies.
      heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": ping\n\n")); }, 25000);
    },
    cancel() {
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
