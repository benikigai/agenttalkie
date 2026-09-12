import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { apiFailure } from "@/lib/server/agenttalkie-http";
import { randomUUID } from "node:crypto";
import {
  CopilotRuntime,
  createCopilotHonoHandler,
} from "@copilotkit/runtime/v2";
import { makeAgent } from "agent-core";
import { MOBILE_FINANCE_PROMPT } from "agent-core/mobile-finance-prompt";

const runtime = new CopilotRuntime({
  agents: () => ({
    default: makeAgent(randomUUID(), {
      workplace: false,
      prompt: MOBILE_FINANCE_PROMPT,
    }),
  }),
});

const app = createCopilotHonoHandler({
  runtime,
  basePath: "/api/mobile-copilotkit",
});

async function handle(request: Request) {
  try { liveOwner(request); return await app.fetch(request); } catch(error) { return apiFailure(error); }
}
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
