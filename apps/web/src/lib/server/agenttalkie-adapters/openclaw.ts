import { z } from "zod";
import {
  AgentTargetSchema, WorkerRequestSchema, WorkerOutcomeSchema,
  type AgentTalkieAdapter, type AgentTarget, type WorkerOutcome, type WorkerRequest,
} from "../../agenttalkie-contract";

export type OpenClawAdapterOptions = {
  target?: AgentTarget;
  connection?: {
    gatewayUrl: string;
    resolveToken: () => Promise<string>;
  };
  // The backend must check the exact request and enforce read-only worker tools
  // before returning true. Possessing a Gateway credential is not authorization.
  authorize?: (request: WorkerRequest) => Promise<boolean>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  now?: () => string;
};

const CompletionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  object: z.literal("chat.completion"),
  error: z.never().optional(),
  choices: z.array(z.object({
    index: z.literal(0),
    finish_reason: z.literal("stop"),
    message: z.object({
      role: z.literal("assistant"),
      content: z.string().trim().min(1).max(12000),
      tool_calls: z.never().optional(),
      function_call: z.never().optional(),
    }),
  })).length(1),
});

const unavailable = (code: string, message: string): WorkerOutcome => ({
  status: "unavailable", code, message: message.trim().slice(0, 2000) || "The selected worker is unavailable.",
});
const failed = (code: string, message: string): WorkerOutcome => ({ status: "failed", code, message });
const deliveryUnknown = () => unavailable("OPENCLAW_DELIVERY_UNKNOWN", "No terminal worker reply was verified. Remote completion is unknown; no retry was sent.");

function endpointFor(gatewayUrl: string): URL {
  const url = new URL(gatewayUrl);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Use a private HTTPS Gateway origin or an HTTP loopback origin without credentials or a path.");
  }
  return new URL("/v1/chat/completions", url);
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 128 * 1024) throw new Error("Response too large.");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function httpFailure(status: number): WorkerOutcome {
  if (status === 401 || status === 403) return unavailable("OPENCLAW_ACCESS_DENIED", "The Gateway did not admit this request. Check credential mediation and the selected session policy.");
  if (status === 404 || status === 405) return unavailable("OPENCLAW_ENDPOINT_UNAVAILABLE", "The existing-session chat endpoint is unavailable. No alternative endpoint was tried.");
  if (status === 429) return unavailable("OPENCLAW_RATE_LIMITED", "The Gateway rate-limited this request. No retry was sent.");
  if (status >= 300 && status < 400) return unavailable("OPENCLAW_REDIRECT_REJECTED", "The configured Gateway redirected the request. Credentials and question were not forwarded.");
  if (status === 400 || status === 422) return failed("OPENCLAW_REQUEST_REJECTED", "The Gateway rejected the request or selected session. No replacement session was created.");
  return deliveryUnknown();
}

export function createOpenClawAdapter(options: OpenClawAdapterOptions = {}): AgentTalkieAdapter {
  const target = options.target ? AgentTargetSchema.parse(options.target) : undefined;
  if (target && (target.evidenceMode !== "live" || !/^[a-zA-Z0-9_-]+$/.test(target.agentId) ||
      !/^[\x21-\x7e]+$/.test(target.workerSessionId) || /^(subagent|cron|acp):/i.test(target.workerSessionId) ||
      /:(subagent|cron|acp):/i.test(target.workerSessionId) ||
      (target.workerSessionId.startsWith("agent:") && !target.workerSessionId.startsWith(`agent:${target.agentId}:`)))) {
    throw new Error("Select a live target with an exact existing session belonging to the configured OpenClaw agent.");
  }
  const connection = options.connection ? { ...options.connection } : undefined;
  const endpoint = connection ? endpointFor(connection.gatewayUrl) : undefined;
  const authorize = options.authorize;
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs ?? 20000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) throw new Error("OpenClaw timeout must be between 1 and 20000 milliseconds.");

  const blocked = !target ? unavailable("OPENCLAW_TARGET_NOT_CONFIGURED", "Select an approved project, OpenClaw agent, and exact existing worker session.")
    : target.availability === "unavailable" ? unavailable("OPENCLAW_WORKER_UNAVAILABLE", target.unavailableReason ?? "The selected worker route is unavailable.")
    : !connection ? unavailable("OPENCLAW_CONNECTION_NOT_CONFIGURED", "The selected worker needs a private Gateway route and mediated credential.")
    : !authorize ? unavailable("OPENCLAW_AUTHORIZATION_REQUIRED", "The selected worker needs request authorization and an enforced read-only tool policy.")
    : undefined;

  // Retain outcomes, including unknown delivery, so an identical retry cannot
  // start a second turn. Backend also deduplicates within its voice session.
  const requests = new Map<string, { request: WorkerRequest; outcome: Promise<WorkerOutcome> }>();

  async function invoke(request: WorkerRequest): Promise<WorkerOutcome> {
    const controller = new AbortController();
    let dispatched = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<WorkerOutcome>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(dispatched ? deliveryUnknown() : unavailable("OPENCLAW_PREPARATION_TIMEOUT", "Worker authorization or credential preparation timed out. No request was sent."));
      }, timeoutMs);
    });
    const work = async (): Promise<WorkerOutcome> => {
      let allowed: boolean;
      try {
        allowed = await authorize!(Object.freeze({ ...request }));
      } catch {
        return unavailable("OPENCLAW_AUTHORIZATION_FAILED", "Worker request authorization could not be verified. No request was sent.");
      }
      if (controller.signal.aborted) return deliveryUnknown();
      if (allowed !== true) return unavailable("OPENCLAW_AUTHORIZATION_REQUIRED", "This exact worker request is not authorized. No request was sent.");
      let token: string;
      try {
        token = await connection!.resolveToken();
      } catch {
        return unavailable("OPENCLAW_CREDENTIAL_UNAVAILABLE", "The mediated Gateway credential is unavailable. No request was sent.");
      }
      if (controller.signal.aborted) return deliveryUnknown();
      if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token) || token.startsWith("op://")) {
        return unavailable("OPENCLAW_CREDENTIAL_UNAVAILABLE", "Resolve the existing secret reference on the server before connecting. No request was sent.");
      }
      dispatched = true;
      const response = await fetcher(endpoint!, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-openclaw-agent-id": target!.agentId,
          "x-openclaw-session-key": target!.workerSessionId,
        },
        body: JSON.stringify({
          // This is the Gateway's agent alias, not a backend model override.
          model: `openclaw:${target!.agentId}`, stream: false,
          messages: [{ role: "user", content: request.question }],
        }),
      });
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        return httpFailure(response.status);
      }
      let completion: z.infer<typeof CompletionSchema>;
      try {
        completion = CompletionSchema.parse(await readJson(response));
      } catch {
        return unavailable("OPENCLAW_INVALID_REPLY", "The Gateway did not return a complete text reply with a run reference. Remote completion is unknown; no retry was sent.");
      }
      const { question: _question, ...identity } = request;
      return WorkerOutcomeSchema.parse({
        status: "completed",
        result: {
          ...identity, answer: completion.choices[0].message.content,
          evidence: [{
            kind: "worker_reply",
            reference: `urn:openclaw:session:${encodeURIComponent(target!.workerSessionId)}:completion:${encodeURIComponent(completion.id)}`,
            // Gateway completion.created is reply time, not project source time.
            sourceObservedAt: null, retrievedAt: now(),
          }],
        },
      });
    };
    try {
      return await Promise.race([work(), deadline]);
    } catch {
      return dispatched ? deliveryUnknown() : unavailable("OPENCLAW_PREPARATION_FAILED", "The worker request could not be prepared. No request was sent.");
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }

  return {
    targets: target ? [Object.freeze({ ...target,
      availability: blocked ? "unavailable" as const : "available" as const,
      unavailableReason: blocked && blocked.status !== "completed" ? blocked.message : null,
    })] : [],
    async execute(raw) {
      const parsed = WorkerRequestSchema.safeParse(raw);
      if (!parsed.success) return failed("INVALID_WORKER_REQUEST", "Provide a valid worker request with its exact identity and question revision.");
      const request = parsed.data;
      if (!target) return structuredClone(blocked!);
      if (request.projectId !== target.projectId || request.agentId !== target.agentId || request.workerSessionId !== target.workerSessionId) {
        return failed("TARGET_NOT_ALLOWED", "The request does not match the approved project and exact existing worker session.");
      }
      if (blocked) return structuredClone(blocked);
      const key = `${request.requestId}:${request.revision}`;
      const existing = requests.get(key);
      if (existing) {
        if (JSON.stringify(existing.request) !== JSON.stringify(request)) return failed("REQUEST_CONFLICT", "This request revision already has a different question or target.");
        return structuredClone(await existing.outcome);
      }
      if (requests.size >= 256) return unavailable("OPENCLAW_REQUEST_LIMIT", "This adapter has reached its retained request limit. Reconcile pending worker turns before replacing it.");
      const outcome = Promise.resolve().then(() => invoke(request));
      requests.set(key, { request, outcome });
      return structuredClone(await outcome);
    },
  };
}
