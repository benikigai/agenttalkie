import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AGENTTALKIE_CONTRACT_VERSION, PrepareFollowupSchema, SessionCommandSchema, SubmitRequestSchema } from "../agenttalkie-contract";
import { AgentTalkieError, type AgentTalkieService } from "./agenttalkie-service";

const cookieName = "agenttalkie-browser";
export const jsonReply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export function apiFailure(error: unknown): Response {
  if (error instanceof AgentTalkieError) return jsonReply({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return jsonReply({ error: { code: "INVALID_INPUT", message: "Invalid request fields or JSON." } }, 400);
  return jsonReply({ error: { code: "INTERNAL_ERROR", message: "The local service could not complete this request." } }, 500);
}

export function browserBoundary(request: Request): { owner: string; headers: Record<string, string> } {
  const expected = new URL(request.url);
  expected.host = request.headers.get("host") || expected.host;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname)) {
    throw new AgentTalkieError(403, "LOCAL_ONLY", "This prototype accepts loopback hosts only. Public hosting requires authenticated users.");
  }
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expected.origin) || (request.method !== "GET" && origin !== expected.origin)) {
    throw new AgentTalkieError(403, "ORIGIN_DENIED", "Use AgentTalkie from this app's own page.");
  }
  if (request.method !== "GET" && request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new AgentTalkieError(415, "JSON_REQUIRED", "Send application/json.");
  }
  const cookie = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const validCookie = cookie && /^[a-f0-9]{64}$/.test(cookie);
  if (!validCookie && request.method !== "GET") throw new AgentTalkieError(401, "BROWSER_SESSION_REQUIRED", "Open the session endpoint first to initialize this browser.");
  const owner = validCookie ? cookie : randomBytes(32).toString("hex");
  return { owner, headers: validCookie ? {} : { "Set-Cookie": `${cookieName}=${owner}; HttpOnly; SameSite=Strict; Path=/api/agenttalkie; Max-Age=14400${expected.protocol === "https:" ? "; Secure" : ""}` } };
}

export async function readJson(request: Request, maxBytes = 20000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AgentTalkieError(413, "BODY_TOO_LARGE", "The request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new AgentTalkieError(413, "BODY_TOO_LARGE", "The request body is too large."); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createAgentTalkieHandlers(options: { service: AgentTalkieService; after: (job: () => Promise<void>) => void }) {
  const wrap = (handler: (request: Request, owner: string) => Promise<{ body: unknown; status?: number }>) => async (request: Request) => {
    try {
      const { owner, headers } = browserBoundary(request);
      const result = await handler(request, owner);
      return jsonReply(result.body, result.status, headers);
    } catch (error) { return apiFailure(error); }
  };
  return {
    session: wrap(async (request, owner) => {
      if (request.method === "GET") {
        const sessionId = new URL(request.url).searchParams.get("sessionId");
        return { body: sessionId ? options.service.snapshot(owner, sessionId) : {
          contractVersion: AGENTTALKIE_CONTRACT_VERSION,
          targets: options.service.targets(),
          persistence: "local_process",
          voice: { provider: "openai", model: "gpt-live-1", status: "unverified" },
        } };
      }
      if (request.method !== "POST") throw new AgentTalkieError(405, "METHOD_NOT_ALLOWED", "Use GET or POST.");
      const command = SessionCommandSchema.parse(await readJson(request));
      return { body: command.operation === "create" ? options.service.create(owner, command.mode) : options.service.end(owner, command.sessionId), status: command.operation === "create" ? 201 : 200 };
    }),
    requests: wrap(async (request, owner) => {
      if (request.method !== "POST") throw new AgentTalkieError(405, "METHOD_NOT_ALLOWED", "Use POST.");
      const input = SubmitRequestSchema.parse(await readJson(request));
      const { snapshot, completion } = options.service.submit(owner, input);
      options.after(() => completion);
      const record = snapshot.session.requests.find((item) => item.requestId === input.requestId && item.revision === input.revision);
      return { body: snapshot, status: record?.state === "pending" ? 202 : 200 };
    }),
    followup: wrap(async (request, owner) => {
      if (request.method !== "POST") throw new AgentTalkieError(405, "METHOD_NOT_ALLOWED", "Use POST.");
      const input = PrepareFollowupSchema.parse(await readJson(request));
      return { body: { followup: options.service.prepare(owner, input) } };
    }),
  };
}
