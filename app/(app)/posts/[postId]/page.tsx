import { getPost } from "@/lib/actions/posts";
import { listMediaAssets } from "@/lib/actions/media";
import { requireUser } from "@/lib/session";
import { listCampaigns } from "@/lib/actions/campaigns";
import { prisma } from "@/lib/prisma";
import { PostEditor } from "./post-editor";

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const post = await getPost(postId);
  const [libraryAssets, currentUser, designers, writers, campaigns] = await Promise.all([
    listMediaAssets(post.clientId),
    requireUser(),
    // Scoped to people on this client, not everyone in the org: the
    // picker used to list the whole roster, and assigning someone who
    // can't open the client just buries the task in a queue they can't
    // reach. Managers and admins reach every client, so they're always in.
    listAssignable(post.clientId, "DESIGNER"),
    listAssignable(post.clientId, "WRITER"),
    listCampaigns(post.clientId),
  ]);

  return (
    <PostEditor
      post={post}
      libraryAssets={libraryAssets}
      currentUser={currentUser}
      designers={designers}
      writers={writers}
      campaigns={campaigns}
    />
  );
}

function listAssignable(clientId: string, role: "DESIGNER" | "WRITER") {
  return prisma.user.findMany({
    where: {
      OR: [
        { role, clientMemberships: { some: { clientId } } },
        { role: { in: ["ADMIN", "MANAGER"] } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
