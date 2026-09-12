import assert from "node:assert/strict";
import test from "node:test";
import { ApiErrorSchema, VoiceConnectionSchema } from "../agenttalkie-contract";
import { AgentTalkieService } from "./agenttalkie-service";
import { createAgentTalkieVoiceHandler } from "./agenttalkie-voice";

const origin = "http://127.0.0.1:3100";
const owner = "a".repeat(64);
const offer = "v=0\r\ns=offline-browser-offer\r\n";
const answer = "v=0\r\ns=offline-provider-answer\r\n";
const fakeKey = "offline-test-key";

function request(sessionId: string, body: unknown = { sessionId, sdp: offer }) {
  return new Request(`${origin}/api/agenttalkie/voice`, {
    method: "POST",
    headers: { origin, cookie: `agenttalkie-browser=${owner}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function harness(options: {
  enabled?: boolean;
  key?: string | null;
  mode?: "fixture" | "live";
  upstream?: () => Promise<Response>;
} = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let keyReads = 0;
  let gateReads = 0;
  const service = new AgentTalkieService({ adapters: [] });
  const initial = service.create(owner, options.mode ?? "live");
  const handler = createAgentTalkieVoiceHandler({
    service,
    enabled: () => { gateReads += 1; return options.enabled ?? true; },
    apiKey: () => { keyReads += 1; return options.key === null ? undefined : options.key ?? fakeKey; },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return options.upstream ? options.upstream() : Response.json({
        session: { id: "offline-provider-session" }, transport: { type: "webrtc", sdp: answer },
      });
    },
  });
  return { handler, service, sessionId: initial.session.id, calls, keyReads: () => keyReads, gateReads: () => gateReads };
}

async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(ApiErrorSchema.parse(body).error.code, code);
  assert.doesNotMatch(JSON.stringify(body), /offline-test-key|private upstream|private network/);
}

test("voice broker posts gpt-live-1 JSON with client delegation and returns only the WebRTC connection", async () => {
  const { handler, sessionId, calls } = harness();
  const response = await handler(request(sessionId));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(VoiceConnectionSchema.parse(await response.json()), {
    sessionId: "offline-provider-session", provider: "openai", model: "gpt-live-1", sdp: answer,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/live/sessions");
  const init = calls[0].init!;
  assert.equal(init.method, "POST");
  assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${fakeKey}`);
  assert.equal(new Headers(init.headers).get("content-type"), "application/json");
  assert.ok(init.signal instanceof AbortSignal);
  const body = JSON.parse(String(init.body));
  assert.deepEqual(Object.keys(body).sort(), ["session", "transport"]);
  assert.equal(body.session.model, "gpt-live-1");
  assert.deepEqual(body.session.delegation, { type: "client" });
  assert.deepEqual(body.transport, { type: "webrtc", sdp: offer });
  assert.match(body.session.instructions, /Never claim a follow-up was sent/);
  assert.match(body.session.instructions, /do not speak superseded answers/);
});

test("disabled voice cannot read credentials or call the provider", async () => {
  const { handler, sessionId, calls, keyReads, gateReads } = harness({ enabled: false });
  await error(await handler(request(sessionId)), 503, "LIVE_VOICE_NOT_ENABLED");
  assert.equal(gateReads(), 1);
  assert.equal(keyReads(), 0);
  assert.equal(calls.length, 0);
});

test("missing credentials return unavailable without attempting a provider session", async () => {
  const { handler, sessionId, calls, keyReads } = harness({ key: null });
  await error(await handler(request(sessionId)), 503, "LIVE_VOICE_UNCONFIGURED");
  assert.equal(keyReads(), 1);
  assert.equal(calls.length, 0);
});

test("fixture and ended sessions fail before checking gates, credentials, or providers", async () => {
  for (const mode of ["fixture", "live"] as const) {
    const { handler, service, sessionId, calls, keyReads, gateReads } = harness({ mode });
    if (mode === "live") service.end(owner, sessionId);
    await error(await handler(request(sessionId)), 409, "LIVE_SESSION_REQUIRED");
    assert.equal(gateReads(), 0);
    assert.equal(keyReads(), 0);
    assert.equal(calls.length, 0);
  }
});

test("voice checks browser ownership and input limits before accessing the provider", async () => {
  const { handler, sessionId, calls, keyReads, gateReads } = harness();
  const otherBrowser = request(sessionId);
  otherBrowser.headers.set("cookie", `agenttalkie-browser=${"b".repeat(64)}`);
  await error(await handler(otherBrowser), 404, "SESSION_NOT_FOUND");
  const otherOrigin = request(sessionId);
  otherOrigin.headers.set("origin", "https://external.example");
  await error(await handler(otherOrigin), 403, "ORIGIN_DENIED");
  await error(await handler(request(sessionId, { sessionId, sdp: "" })), 400, "INVALID_INPUT");
  await error(await handler(request(sessionId, { sessionId, sdp: "x".repeat(100001) })), 400, "INVALID_INPUT");
  await error(await handler(request(sessionId, { sessionId, sdp: "界".repeat(40000) })), 413, "BODY_TOO_LARGE");
  assert.equal(gateReads(), 0);
  assert.equal(keyReads(), 0);
  assert.equal(calls.length, 0);
});

test("duplicate successful creation does not create another provider session", async () => {
  const { handler, sessionId, calls } = harness();
  assert.equal((await handler(request(sessionId))).status, 201);
  await error(await handler(request(sessionId)), 409, "VOICE_ALREADY_ATTEMPTED");
  assert.equal(calls.length, 1);
});

test("concurrent creation cannot race into a second billable session", async () => {
  let resolve!: (response: Response) => void;
  const upstream = new Promise<Response>((accept) => { resolve = accept; });
  let started!: () => void;
  const firstFetch = new Promise<void>((accept) => { started = accept; });
  const { handler, sessionId, calls } = harness({ upstream: () => { started(); return upstream; } });
  const pending = handler(request(sessionId));
  await firstFetch;
  await error(await handler(request(sessionId)), 409, "VOICE_ALREADY_ATTEMPTED");
  resolve(Response.json({ session: { id: "offline-provider-session" }, transport: { type: "webrtc", sdp: answer } }));
  assert.equal((await pending).status, 201);
  assert.equal(calls.length, 1);
});

test("uncertain network failure is sanitized and never retried", async () => {
  const { handler, sessionId, calls } = harness({ upstream: async () => { throw new Error(`private network ${fakeKey}`); } });
  await error(await handler(request(sessionId)), 502, "VOICE_DELIVERY_UNKNOWN");
  await error(await handler(request(sessionId)), 409, "VOICE_ALREADY_ATTEMPTED");
  assert.equal(calls.length, 1);
});

test("upstream rejection is sanitized and never retried", async () => {
  const { handler, sessionId, calls } = harness({ upstream: async () => new Response(`private upstream ${fakeKey}`, { status: 401 }) });
  await error(await handler(request(sessionId)), 502, "VOICE_PROVIDER_REJECTED");
  await error(await handler(request(sessionId)), 409, "VOICE_ALREADY_ATTEMPTED");
  assert.equal(calls.length, 1);
});

test("invalid provider JSON shape returns a provider error without credential leakage or retry", async () => {
  for (const body of [
    { private: `private upstream ${fakeKey}` },
    { session: { id: "provider-session" }, transport: { type: "websocket", sdp: answer } },
    { session: { id: "provider-session" }, transport: { type: "webrtc", sdp: "" } },
  ]) {
    const { handler, sessionId, calls } = harness({ upstream: async () => Response.json(body) });
    await error(await handler(request(sessionId)), 502, "VOICE_RESPONSE_INVALID");
    await error(await handler(request(sessionId)), 409, "VOICE_ALREADY_ATTEMPTED");
    assert.equal(calls.length, 1);
  }
});

test("malformed upstream JSON remains a provider error and is never retried", async () => {
  const { handler, sessionId, calls } = harness({ upstream: async () => new Response(`private upstream ${fakeKey}`, { status: 200 }) });
  await error(await handler(request(sessionId)), 502, "VOICE_RESPONSE_INVALID");
  await error(await handler(request(sessionId)), 409, "VOICE_ALREADY_ATTEMPTED");
  assert.equal(calls.length, 1);
});

test("durable offer claims reject replay across handlers and allow an explicit fresh connection", async () => {
  const service = new AgentTalkieService({ adapters: [] });
  const sessionId = service.create(owner,"live").session.id;
  const claims = new Set<string>();
  let calls = 0;
  const make = () => createAgentTalkieVoiceHandler({
    service, enabled:()=>true, apiKey:()=>fakeKey,
    claim:async (_owner,id,hash)=>{
      await Promise.resolve();
      const key=`${id}:${hash}`;
      if(claims.has(key)) throw new (await import("./agenttalkie-service")).AgentTalkieError(409,"VOICE_ALREADY_ATTEMPTED","Already attempted");
      claims.add(key);
    },
    fetch:async()=>{calls++;return Response.json({session:{id:"offline-provider-session"},transport:{type:"webrtc",sdp:answer}});},
  });
  const handler=make();
  const replies=await Promise.all([handler(request(sessionId)),handler(request(sessionId))]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);
  await error(await make()(request(sessionId)),409,"VOICE_ALREADY_ATTEMPTED");
  assert.equal((await handler(request(sessionId,{sessionId,sdp:offer+"a=ice-ufrag:new-connection\r\n"}))).status,201);
  assert.equal(calls,2);
});
