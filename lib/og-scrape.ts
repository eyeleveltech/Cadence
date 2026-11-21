import "server-only";
import { lookup } from "dns/promises";
import dns from "dns";
import { isIP } from "net";
import { Agent } from "undici";

/**
 * Pulls og:title / og:image from an arbitrary URL — Pinterest pins,
 * Instagram posts, YouTube links — for the mood board. Regex over the
 * raw HTML rather than a DOM parser: we only need two meta tags, and
 * pulling in a parser dependency for that is more than this needs.
 * Best-effort — a mood board tile with no preview still saves fine.
 *
 * The URL comes from whoever is filling in the board, and this runs on
 * the server, inside the network that holds Postgres and Redis. So
 * before fetching anything we resolve the host and refuse addresses that
 * aren't on the public internet — otherwise "add a reference" is a
 * request forgery primitive pointed at the cloud metadata endpoint,
 * redis://localhost, or anything else reachable from the app container.
 *
 * To prevent TOCTOU DNS rebinding, we pin the DNS resolution directly
 * in the undici dispatcher lookup handler so the socket connects only
 * to the verified public IP while preserving TLS SNI and Host headers.
 */

const MAX_BYTES = 512 * 1024; // more than enough for a <head>
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

/**
 * Creates an undici dispatcher that intercepts DNS resolution at socket
 * connect time and ensures every address is on the public internet.
 * Pins the first verified public address to eliminate DNS rebinding TOCTOU.
 */
export function createSSRFProtectedDispatcher() {
  return new Agent({
    connect: {
      lookup: (hostname, opts, callback) => {
        dns.lookup(hostname, { all: true }, (err, addresses) => {
          if (err) return callback(err, null as never);

          if (!addresses || addresses.length === 0) {
            return callback(new Error(`DNS resolution returned no addresses for '${hostname}'`), null as never);
          }

          const hasInvalid = addresses.some((a) => !isPublicAddress(a.address));
          if (hasInvalid) {
            return callback(
              new Error(`SSRF blocked: hostname '${hostname}' resolved to non-public address`),
              null as never,
            );
          }

          const pinned = addresses[0];
          if (opts.all) {
            callback(null, [pinned] as never);
          } else {
            callback(null, pinned.address, pinned.family);
          }
        });
      },
    },
  });
}

const ssrfDispatcher = createSSRFProtectedDispatcher();

export async function fetchOpenGraphPreview(url: string): Promise<{
  title: string | null;
  image: string | null;
}> {
  try {
    const html = await fetchPublicHtml(url);
    if (!html) return { title: null, image: null };

    const title =
      matchMetaContent(html, "og:title") ?? matchTag(html, "title");
    const image = matchMetaContent(html, "og:image");

    return { title, image };
  } catch {
    return { title: null, image: null };
  }
}

/**
 * Follows redirects by hand with pinned socket DNS resolution.
 * Every hop re-validates the destination URL and connects only
 * through the SSRF-protected dispatcher.
 */
export async function fetchPublicHtml(
  startUrl: string,
  dispatcher = ssrfDispatcher,
): Promise<string | null> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isPubliclyRoutable(current))) return null;

    try {
      const res = await fetch(current, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CadenceBot/1.0)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
        dispatcher,
      } as RequestInit & { dispatcher?: Agent });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }

      if (!res.ok) return null;
      if (!res.headers.get("content-type")?.includes("html")) return null;

      return await readCapped(res);
    } catch {
      return null;
    }
  }

  return null;
}

/** Stops a hostile or merely enormous page from pulling the server's
 * memory down with it. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});

  return new TextDecoder().decode(
    chunks.reduce<Uint8Array>((all, chunk) => {
      const merged = new Uint8Array(all.length + chunk.length);
      merged.set(all);
      merged.set(chunk, all.length);
      return merged;
    }, new Uint8Array()),
  ).slice(0, MAX_BYTES);
}

async function isPubliclyRoutable(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // file:, data:, gopher: and friends have no business here.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.replace(/^\[|\]$/g, "");

  // A literal address skips DNS; anything else we resolve, because the
  // name is not the destination.
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((a) => a.address);

  return addresses.length > 0 && addresses.every(isPublicAddress);
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIPv4(address);
  if (version === 6) return isPublicIPv6(address);
  return false;
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;

  if (a === 0) return false; // this network
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a >= 224) return false; // multicast, reserved, broadcast

  return true;
}

function isPublicIPv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return false; // unspecified, loopback
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return false; // link-local
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false; // unique-local
  if (normalized.startsWith("ff")) return false; // multicast

  // ::ffff:10.0.0.1 and friends — an IPv4 address wearing a v6 hat.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);

  return true;
}

function matchMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].slice(0, 500);
  }
  return null;
}

function matchTag(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
  return match ? match[1].trim().slice(0, 500) : null;
}
