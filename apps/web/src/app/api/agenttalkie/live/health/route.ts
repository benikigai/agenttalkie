import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { sql } from "@/lib/server/agenttalkie-live-store";
import { apiFailure,jsonReply } from "@/lib/server/agenttalkie-http";

export async function GET(request: Request) {
  try {
    liveOwner(request);
    const runners = await sql()`SELECT id FROM agenttalkie_runners WHERE heartbeat > now()-interval '45 seconds' LIMIT 1`;
    return jsonReply({
      storage: "connected",
      voice: process.env.OPENAI_API_KEY && process.env.AGENTTALKIE_LIVE_VOICE_ENABLED === "true" ? "configured" : "unconfigured",
      task: process.env.AMBIGUOUS_API_KEY && process.env.AGENTTALKIE_TASK_ID ? "configured" : "unconfigured",
      research: process.env.EXA_API_KEY ? "configured" : "unconfigured",
      runner: runners.length ? "connected" : "offline",
    });
  } catch (error) { return apiFailure(error); }
}
