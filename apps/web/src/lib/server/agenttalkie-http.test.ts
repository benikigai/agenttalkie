import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENTTALKIE_CONTRACT_VERSION, ApiErrorSchema, PreparedFollowupSchema,
  SessionSnapshotSchema, type AgentTalkieAdapter, type WorkerOutcome, type WorkerRequest,
} from "../agenttalkie-contract";
import {
  agenttalkieFixtureRequest, agenttalkieFixtureResult, agenttalkieFixtureTarget,
} from "../agenttalkie-fixture";
import { createAgentTalkieHandlers } from "./agenttalkie-http";
import { AgentTalkieService } from "./agenttalkie-service";

const origin = "http://127.0.0.1:3100";
const owner = "a".repeat(64);
const cookie = `agenttalkie-browser=${owner}`;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/agenttalkie/${path}`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function completed(request: WorkerRequest): WorkerOutcome {
  return { status: "completed", result: {
    ...agenttalkieFixtureResult,
    requestId: request.requestId, revision: request.revision,
    projectId: request.projectId, agentId: request.agentId, workerSessionId: request.workerSessionId,
  } };
}

function harness(execute: AgentTalkieAdapter["execute"] = async (request) => completed(request)) {
  const calls: WorkerRequest[] = [];
  const jobs: (() => Promise<void>)[] = [];
  const service = new AgentTalkieService({ adapters: [{
    targets: [agenttalkieFixtureTarget],
    execute(request) { calls.push(structuredClone(request)); return execute(request); },
  }] });
  const handlers = createAgentTalkieHandlers({ service, after: (job) => { jobs.push(job); } });
  const initial = service.create(owner, "fixture");
  const input = { ...agenttalkieFixtureRequest, sessionId: initial.session.id };
  return { service, handlers, initial, input, calls, jobs };
}

async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(ApiErrorSchema.parse(await response.json()).error.code, code);
}

test("GET bootstrap issues a private browser cookie that authorizes session creation", async () => {
  const { handlers } = harness();
  const response = await handlers.session(new Request(`${origin}/api/agenttalkie/session`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const setCookie = response.headers.get("set-cookie")!;
  assert.match(setCookie, /^agenttalkie-browser=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/api\/agenttalkie; Max-Age=14400$/);
  const bootstrap = await response.json();
  assert.equal(bootstrap.contractVersion, AGENTTALKIE_CONTRACT_VERSION);
  assert.equal(bootstrap.persistence, "local_process");
  assert.equal(bootstrap.targets[0].evidenceMode, "fixture");
  assert.deepEqual(bootstrap.voice, { provider: "openai", model: "gpt-live-1", status: "unverified" });

  const browserCookie = setCookie.split(";")[0];
  const created = await handlers.session(post("session", { operation: "create", mode: "fixture" }, { cookie: browserCookie }));
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("set-cookie"), null);
  const snapshot = SessionSnapshotSchema.parse(await created.json());
  const retrieved = await handlers.session(new Request(`${origin}/api/agenttalkie/session?sessionId=${snapshot.session.id}`, { headers: { cookie: browserCookie } }));
  assert.equal(retrieved.status, 200);
  assert.equal(SessionSnapshotSchema.parse(await retrieved.json()).session.id, snapshot.session.id);
});

test("loopback bootstrap accepts IPv4, IPv6, and localhost and secures HTTPS cookies", async () => {
  const { handlers } = harness();
  for (const address of ["http://localhost:3100", "http://127.0.0.1:3100", "http://[::1]:3100", "https://localhost:3100"]) {
    const response = await handlers.session(new Request(`${address}/api/agenttalkie/session`));
    assert.equal(response.status, 200, address);
    assert.equal(response.headers.get("set-cookie")!.includes("; Secure"), address.startsWith("https:"));
  }
});

test("browser origin and Host restrictions reject requests before worker execution", async () => {
  const { handlers, input, calls, jobs } = harness();
  const denied: [Record<string, string>, string][] = [
    [{ origin: "https://external.example" }, "ORIGIN_DENIED"],
    [{ origin: "http://127.0.0.1:3101" }, "ORIGIN_DENIED"],
    [{ origin: "http://localhost:3100" }, "ORIGIN_DENIED"],
    [{ "sec-fetch-site": "cross-site" }, "ORIGIN_DENIED"],
    [{ host: "external.example:3100" }, "LOCAL_ONLY"],
    [{ host: "127.0.0.1.external.example:3100" }, "LOCAL_ONLY"],
    [{ host: "localhost:3100" }, "ORIGIN_DENIED"],
  ];
  for (const [headers, code] of denied) await error(await handlers.requests(post("requests", input, headers)), 403, code);
  const missingOrigin = post("requests", input);
  missingOrigin.headers.delete("origin");
  await error(await handlers.requests(missingOrigin), 403, "ORIGIN_DENIED");
  await error(await handlers.session(new Request(`${origin}/api/agenttalkie/session`, { headers: { origin: "https://external.example" } })), 403, "ORIGIN_DENIED");
  await error(await handlers.session(new Request("https://external.example/api/agenttalkie/session")), 403, "LOCAL_ONLY");
  assert.equal(calls.length, 0);
  assert.equal(jobs.length, 0);
});

test("mutations require a valid browser cookie and JSON content type", async () => {
  const { handlers, input, calls, jobs } = harness();
  for (const invalidCookie of ["", "agenttalkie-browser=short", `agenttalkie-browser=${"g".repeat(64)}`]) {
    await error(await handlers.requests(post("requests", input, { cookie: invalidCookie })), 401, "BROWSER_SESSION_REQUIRED");
  }
  await error(await handlers.requests(post("requests", input, { "content-type": "text/plain" })), 415, "JSON_REQUIRED");
  await error(await handlers.session(post("session", { operation: "create" }, { cookie: "" })), 401, "BROWSER_SESSION_REQUIRED");
  assert.equal(calls.length, 0);
  assert.equal(jobs.length, 0);
});

test("malformed fields and JSON cannot execute a worker or schedule completion", async () => {
  const { handlers, input, calls, jobs } = harness();
  for (const body of [
    { ...input, requestId: "not-a-uuid" }, { ...input, revision: 0 },
    { ...input, question: " " }, { ...input, question: "x".repeat(4001) },
    { ...input, unauthorizedField: true }, { ...input, sessionId: "missing" }, null,
  ]) await error(await handlers.requests(post("requests", body)), 400, "INVALID_INPUT");
  await error(await handlers.requests(new Request(`${origin}/api/agenttalkie/requests`, {
    method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: "{not JSON",
  })), 400, "INVALID_INPUT");
  await error(await handlers.session(post("session", { operation: "delete", sessionId: input.sessionId })), 400, "INVALID_INPUT");
  await error(await handlers.followup(post("followup", { sessionId: input.sessionId, requestId: input.requestId, revision: 1, scope: "" })), 400, "INVALID_INPUT");
  assert.equal(calls.length, 0);
  assert.equal(jobs.length, 0);
});

test("oversized bodies are rejected using both declared length and streamed byte count", async () => {
  const { handlers, input, calls, jobs } = harness();
  await error(await handlers.requests(post("requests", input, { "content-length": "20001" })), 413, "BODY_TOO_LARGE");
  const oversized = post("requests", { ...input, question: "界".repeat(7000) });
  assert.equal(oversized.headers.get("content-length"), null);
  await error(await handlers.requests(oversized), 413, "BODY_TOO_LARGE");
  assert.equal(calls.length, 0);
  assert.equal(jobs.length, 0);
});

test("another browser cannot read, submit, end, or prepare another owner's session", async () => {
  const { handlers, input, service, calls, jobs } = harness();
  const otherCookie = `agenttalkie-browser=${"b".repeat(64)}`;
  await error(await handlers.session(new Request(`${origin}/api/agenttalkie/session?sessionId=${input.sessionId}`, { headers: { cookie: otherCookie } })), 404, "SESSION_NOT_FOUND");
  await error(await handlers.requests(post("requests", input, { cookie: otherCookie })), 404, "SESSION_NOT_FOUND");
  await error(await handlers.session(post("session", { operation: "end", sessionId: input.sessionId }, { cookie: otherCookie })), 404, "SESSION_NOT_FOUND");
  await error(await handlers.followup(post("followup", { sessionId: input.sessionId, requestId: input.requestId, revision: 1, scope: "Check blockers" }, { cookie: otherCookie })), 404, "SESSION_NOT_FOUND");
  assert.equal(service.snapshot(owner, input.sessionId).session.status, "active");
  assert.equal(calls.length, 0);
  assert.equal(jobs.length, 0);
});

test("submission returns pending and registers completion with after before polling the final result", async () => {
  let resolve!: (outcome: WorkerOutcome) => void;
  const work = new Promise<WorkerOutcome>((accept) => { resolve = accept; });
  const { handlers, input, calls, jobs } = harness(() => work);
  const response = await handlers.requests(post("requests", input));
  assert.equal(response.status, 202);
  const pending = SessionSnapshotSchema.parse(await response.json());
  assert.equal(pending.session.requests[0].state, "pending");
  assert.equal(pending.currentResult, null);
  assert.equal(jobs.length, 1);
  assert.equal(calls.length, 1);
  resolve(completed(input));
  await jobs[0]();

  const poll = await handlers.session(new Request(`${origin}/api/agenttalkie/session?sessionId=${input.sessionId}`, { headers: { cookie } }));
  const finished = SessionSnapshotSchema.parse(await poll.json());
  assert.equal(finished.session.requests[0].state, "completed");
  assert.equal(finished.currentResult?.requestId, input.requestId);
  assert.equal(finished.currentResult?.evidence[0].kind, "fixture");
  const retry = await handlers.requests(post("requests", input));
  assert.equal(retry.status, 200);
  await jobs[1]();
  assert.equal(calls.length, 1);
});

test("followup endpoint returns a prepared recipient-bound draft without executing or scheduling work", async () => {
  const { handlers, service, input, calls, jobs } = harness();
  await service.submit(owner, input).completion;
  const response = await handlers.followup(post("followup", {
    sessionId: input.sessionId, requestId: input.requestId, revision: 1, scope: "  Check the remaining blockers.  ",
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["followup"]);
  const followup = PreparedFollowupSchema.parse(body.followup);
  assert.equal(followup.status, "prepared");
  assert.equal(followup.recipient, agenttalkieFixtureTarget.agentName);
  assert.equal(followup.workerSessionId, input.workerSessionId);
  assert.equal(followup.revision, 1);
  assert.equal(followup.scope, "Check the remaining blockers.");
  assert.equal(calls.length, 1);
  assert.equal(jobs.length, 0);
});
