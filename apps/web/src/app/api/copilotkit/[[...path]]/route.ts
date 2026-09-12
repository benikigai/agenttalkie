import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { apiFailure } from "@/lib/server/agenttalkie-http";
/**
 * The web surface's runtime endpoint.
 *
 * A Hono app built at module scope; Next.js route handlers are fetch-based, so
 * `app.fetch` is the handler. The catch-all segment lets Hono route the
 * runtime's sub-paths itself.
 *
 * TWO THINGS TO NOT DO HERE:
 *
 * 1. Do NOT declare `channels` on this runtime, and never call
 *    `app.channels.ready()`. Next.js isolates freeze and recycle per request,
 *    so a cold start would mint a competing listener for the same Channel —
 *    and managed delivery is claim-based, so the loser silently gets nothing.
 *    The Channels listener is `apps/channel`, a long-running process.
 *
 * 2. Do NOT reuse one agent instance across requests. The factory form hands
 *    out a fresh agent per resolution.
 */
import { randomUUID } from "node:crypto";
import {
  CopilotRuntime,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import { makeAgent } from "agent-core";

// Web writes use /api/followups after a browser approval. Never expose raw MCP writes here.
const runtime = new CopilotRuntime({
  agents: () => ({ default: makeAgent(randomUUID(), { workplace: false, prompt: "You are AgentTalkie. Use the registered frontend tools and current workspace context to select the allowed target, ask or correct a question, and prepare followups. Never invent task state or claim sending, saving, or deployment. Prepared means not sent. Use current revisions only." }) }),
});

const app = createCopilotHonoHandler({
  runtime,
  basePath: "/api/copilotkit",
});

async function handle(request: Request) {
  try { liveOwner(request); return await app.fetch(request); } catch(error) { return apiFailure(error); }
}
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
