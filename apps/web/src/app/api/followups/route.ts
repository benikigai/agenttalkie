import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { apiFailure } from "@/lib/server/agenttalkie-http";
import { resolve } from "node:path";
import { createFollowupHandler } from "@/lib/server/followup-http";
import { configuredWorkplace } from "@/lib/server/workplace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createFollowupHandler({
  connect: () =>
    process.env.AMBIGUOUS_API_KEY?.trim() ? configuredWorkplace() : undefined,
  directory: resolve(process.env.WEB_APPROVAL_DIR || ".data/web-approvals"),
});
async function authenticatedHandler(request: Request) {
  try {
    const url = new URL(request.url);
    url.host = request.headers.get("host") || url.host;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) liveOwner(request);
    return await handler(request);
  } catch (error) { return apiFailure(error); }
}
export const GET = authenticatedHandler;
export const POST = authenticatedHandler;
