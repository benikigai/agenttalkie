import { after } from "next/server";
import { configuredPublicDemoOrigins, createAgentTalkieHandlers } from "@/lib/server/agenttalkie-http";
import { agenttalkieService } from "@/lib/server/agenttalkie-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = createAgentTalkieHandlers({ service: agenttalkieService, after, publicDemoOrigins: configuredPublicDemoOrigins() }).session;
export const GET = handler;
export const POST = handler;
