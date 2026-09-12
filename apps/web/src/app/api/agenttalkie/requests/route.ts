import { after } from "next/server";
import { configuredPublicDemoOrigins, createAgentTalkieHandlers } from "@/lib/server/agenttalkie-http";
import { agenttalkieService } from "@/lib/server/agenttalkie-runtime";

export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = createAgentTalkieHandlers({ service: agenttalkieService, after, publicDemoOrigins: configuredPublicDemoOrigins() }).requests;
