import { agenttalkieService } from "@/lib/server/agenttalkie-runtime";
import { createAgentTalkieVoiceHandler } from "@/lib/server/agenttalkie-voice";

export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = createAgentTalkieVoiceHandler({
  service: agenttalkieService,
  enabled: () => process.env.AGENTTALKIE_LIVE_VOICE_ENABLED === "true",
  apiKey: () => process.env.OPENAI_API_KEY,
});
