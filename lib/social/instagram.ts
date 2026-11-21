/**
 * Instagram Collaborator & User Tag Auto-Resolver
 */

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v22.0";

/**
 * Sanitizes an Instagram handle: strips leading @ and any whitespace.
 */
export function sanitizeInstagramHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").trim();
}

/**
 * Resolves a public Instagram Business/Creator handle to its numeric Instagram user ID
 * using Meta's Business Discovery Graph API.
 * Returns null if the account cannot be discovered (e.g. personal, private, or does not exist).
 */
export async function resolveInstagramUserId(
  targetHandle: string,
  connectedIgUserId: string,
  accessToken: string
): Promise<string | null> {
  const cleanHandle = sanitizeInstagramHandle(targetHandle);
  if (!cleanHandle) return null;

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${connectedIgUserId}?fields=business_discovery.username(${cleanHandle}){id,username}&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
      console.warn(
        `[Instagram Tag Resolver] Cannot tag profile @${cleanHandle} as official collaborator: ${errData.error?.message || res.statusText}`
      );
      return null;
    }
    const data = (await res.json()) as { business_discovery?: { id?: string; username?: string } };
    if (data.business_discovery?.id) {
      console.log(`[Instagram Tag Resolver] Successfully resolved @${cleanHandle} -> ${data.business_discovery.id}`);
      return data.business_discovery.id;
    }
    return null;
  } catch (err) {
    console.warn(`[Instagram Tag Resolver] Network error resolving @${cleanHandle}:`, err);
    return null;
  }
}

/**
 * Resolves collaborators for an Instagram post:
 * 1. Resolves valid handles to numeric user IDs.
 * 2. If any collaborator cannot be officially tagged (e.g. private profile),
 *    returns a caption fallback appending "with @handle" to the caption so they are credited in text without failing.
 */
export async function prepareInstagramCollaborators(
  handles: string[] | undefined,
  connectedIgUserId: string,
  accessToken: string,
  caption: string
): Promise<{
  collaboratorUserIds: string[];
  finalCaption: string;
}> {
  if (!handles || handles.length === 0) {
    return { collaboratorUserIds: [], finalCaption: caption };
  }

  const collaboratorUserIds: string[] = [];
  const textFallbacks: string[] = [];

  for (const rawHandle of handles) {
    const clean = sanitizeInstagramHandle(rawHandle);
    if (!clean) continue;

    const numericId = await resolveInstagramUserId(clean, connectedIgUserId, accessToken);
    if (numericId) {
      collaboratorUserIds.push(numericId);
    } else {
      textFallbacks.push(`@${clean}`);
    }
  }

  let finalCaption = caption;
  if (textFallbacks.length > 0) {
    const fallbackText = `Collab with ${textFallbacks.join(" ")}`;
    if (!finalCaption.includes(fallbackText)) {
      finalCaption = finalCaption.trim() ? `${finalCaption.trim()}\n\n${fallbackText}` : fallbackText;
    }
  }

  return { collaboratorUserIds, finalCaption };
}
