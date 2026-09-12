import { z } from "zod";
import { CreateVoiceSchema, VoiceConnectionSchema } from "../agenttalkie-contract";
import { apiFailure, browserBoundary, jsonReply, readJson } from "./agenttalkie-http";
import { AgentTalkieError, type AgentTalkieService } from "./agenttalkie-service";

const providerResponse = z.object({
  session: z.object({ id: z.string().min(1) }),
  transport: z.object({ type: z.literal("webrtc"), sdp: z.string().min(1) }),
});
const instructions = "You are AgentTalkie's voice host. Discuss the selected existing worker's actual work. Delegate substantive questions and corrections to the client. Clearly attribute supplied results and distinguish fixture, checkpoint, source read, and worker reply evidence. Never claim a follow-up was sent. Wait for current verified results; do not speak superseded answers.";

export function createAgentTalkieVoiceHandler(options: {
  service: AgentTalkieService;
  enabled: () => boolean;
  apiKey: () => string | undefined;
  fetch?: typeof fetch;
}) {
  // A repeated or uncertain broker call must not create another billable session.
  const attempted = new Set<string>();
  return async (request: Request) => {
    try {
      const { owner } = browserBoundary(request);
      if (request.method !== "POST") throw new AgentTalkieError(405, "METHOD_NOT_ALLOWED", "Use POST.");
      const input = CreateVoiceSchema.parse(await readJson(request, 110000));
      const snapshot = options.service.snapshot(owner, input.sessionId);
      if (snapshot.session.status !== "active" || snapshot.session.mode !== "live") throw new AgentTalkieError(409, "LIVE_SESSION_REQUIRED", "Start an active live conversation before connecting voice.");
      if (!options.enabled()) throw new AgentTalkieError(503, "LIVE_VOICE_NOT_ENABLED", "Live voice has not been enabled for this local runtime. Provider spend and account access remain unverified.");
      const apiKey = options.apiKey();
      if (!apiKey) throw new AgentTalkieError(503, "LIVE_VOICE_UNCONFIGURED", "The server has no OpenAI credential configured through the operator's secret manager.");
      if (attempted.has(input.sessionId)) throw new AgentTalkieError(409, "VOICE_ALREADY_ATTEMPTED", "Voice creation was already attempted. Do not retry an uncertain provider session automatically.");
      attempted.add(input.sessionId);
      let response: Response;
      try {
        response = await (options.fetch ?? fetch)("https://api.openai.com/v1/live/sessions", {
          method: "POST", signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ session: { model: "gpt-live-1", instructions, delegation: { type: "client" } }, transport: { type: "webrtc", sdp: input.sdp } }),
        });
      } catch {
        throw new AgentTalkieError(502, "VOICE_DELIVERY_UNKNOWN", "The voice provider did not return a usable response. Session creation is uncertain; no retry was sent.");
      }
      if (!response.ok) throw new AgentTalkieError(502, "VOICE_PROVIDER_REJECTED", "The voice provider rejected session creation. Check account access and server configuration.");
      const parsed = providerResponse.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new AgentTalkieError(502, "VOICE_RESPONSE_INVALID", "The voice provider returned an invalid session response. No retry was sent.");
      return jsonReply(VoiceConnectionSchema.parse({ sessionId: parsed.data.session.id, provider: "openai", model: "gpt-live-1", sdp: parsed.data.transport.sdp }), 201);
    } catch (error) { return apiFailure(error); }
  };
}
