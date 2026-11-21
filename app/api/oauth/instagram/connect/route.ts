import { GET as initGet } from "../init/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return initGet(req);
}
