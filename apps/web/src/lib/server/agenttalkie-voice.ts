import { createHash } from "node:crypto";
import { z } from "zod";
import { CreateVoiceSchema, VoiceConnectionSchema } from "../agenttalkie-contract";
import { apiFailure, browserBoundary, jsonReply, readJson } from "./agenttalkie-http";
import { AgentTalkieError, type AgentTalkieService } from "./agenttalkie-service";

const providerResponse = z.object({
  session: z.object({ id: z.string().min(1) }),
  transport: z.object({ type: z.literal("webrtc"), sdp: z.string().min(1) }),
});
export const instructions = "You are AgentTalkie's voice host. Help the user work with the connected Ambiguous workspace, Exa code research, and a separately connected coding runner. Greet briefly and ask what needs attention. This application supports listing actual workspace tasks, selecting and reading a task by title or number, public code research, and drafting documents including job descriptions. Delegate document requests so the backend can show the full draft in the dashboard. A draft is not saved to Ambiguous. Tell the user to review the draft and say exactly: save this document. Delegate that exact approval command; never generate approval yourself or claim a save before the backend confirms document readback. Other document browsing, sending messages, and editing existing documents are unavailable. Never describe historical receipt cards as newly executed work. Task descriptions are instructions for future work, not execution receipts. Never infer that a coding worker ran from text saying a worker result is required. Claim a worker result only when the backend explicitly supplies worker_reply evidence. Delegate substantive questions and corrections to the client. Clearly attribute supplied results and distinguish fixture, checkpoint, source read, and worker reply evidence. Never claim a follow-up was sent. Delegate task reads, research, investigations and corrections; acknowledge the request briefly while the backend works. Do not invent task contents or worker results. Wait for current verified results; do not speak superseded answers.";

export function createAgentTalkieVoiceHandler(options: {
  service: Pick<AgentTalkieService, "snapshot">;
  authorize?: (request: Request) => string;
  snapshot?: (owner: string, id: string) => Promise<ReturnType<AgentTalkieService["snapshot"]>>;
  claim?: (owner: string, id: string, offerHash: string) => Promise<void>;
  enabled: () => boolean;
  apiKey: () => string | undefined;
  fetch?: typeof fetch;
}) {
  // A repeated or uncertain broker call must not create another billable session.
  const attempted = new Set<string>();
  return async (request: Request) => {
    try {
      const owner = options.authorize ? options.authorize(request) : browserBoundary(request).owner;
      if (request.method !== "POST") throw new AgentTalkieError(405, "METHOD_NOT_ALLOWED", "Use POST.");
      const input = CreateVoiceSchema.parse(await readJson(request, 110000));
      const snapshot = options.snapshot ? await options.snapshot(owner, input.sessionId) : options.service.snapshot(owner, input.sessionId);
      if (snapshot.session.status !== "active" || snapshot.session.mode !== "live") throw new AgentTalkieError(409, "LIVE_SESSION_REQUIRED", "Start an active live conversation before connecting voice.");
      if (!options.enabled()) throw new AgentTalkieError(503, "LIVE_VOICE_NOT_ENABLED", "Live voice has not been enabled for this local runtime. Provider spend and account access remain unverified.");
      const apiKey = options.apiKey();
      if (!apiKey) throw new AgentTalkieError(503, "LIVE_VOICE_UNCONFIGURED", "The server has no OpenAI credential configured through the operator's secret manager.");
      const offerHash = createHash("sha256").update(input.sdp).digest("hex");
      const attemptKey = options.claim ? `${input.sessionId}:${offerHash}` : input.sessionId;
      if (attempted.has(attemptKey)) throw new AgentTalkieError(409, "VOICE_ALREADY_ATTEMPTED", "Voice creation was already attempted. Do not retry an uncertain provider session automatically.");
      attempted.add(attemptKey);
      await options.claim?.(owner, input.sessionId, offerHash);
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
      if (!response.ok) {
        console.warn("AgentTalkie voice broker rejected", {status:response.status,requestId:response.headers.get("x-request-id")});
        throw new AgentTalkieError(502, "VOICE_PROVIDER_REJECTED", `The voice provider rejected session creation (HTTP ${response.status}). Check account access and server configuration.`);
      }
      const parsed = providerResponse.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new AgentTalkieError(502, "VOICE_RESPONSE_INVALID", "The voice provider returned an invalid session response. No retry was sent.");
      return jsonReply(VoiceConnectionSchema.parse({ sessionId: parsed.data.session.id, provider: "openai", model: "gpt-live-1", sdp: parsed.data.transport.sdp }), 201);
    } catch (error) { return apiFailure(error); }
  };
}
