import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionSnapshotSchema, SubmitRequestSchema, WorkerResultSchema,
  type AgentTalkieAdapter, type AgentTarget, type WorkerOutcome, type WorkerRequest,
} from "../agenttalkie-contract";
import {
  agenttalkieFixtureRequest, agenttalkieFixtureResult, agenttalkieFixtureTarget,
  agenttalkieUnavailableTarget,
} from "../agenttalkie-fixture";
import { AgentTalkieError, AgentTalkieService } from "./agenttalkie-service";

const owner = "browser-one";
const now = "2026-09-12T20:00:00Z";
const otherRequestId = "00000000-0000-4000-8000-000000000003";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function completed(request: WorkerRequest): WorkerOutcome {
  return {
    status: "completed",
    result: WorkerResultSchema.parse({
      ...agenttalkieFixtureResult,
      requestId: request.requestId,
      revision: request.revision,
      projectId: request.projectId,
      agentId: request.agentId,
      workerSessionId: request.workerSessionId,
      answer: `Fixture answer for revision ${request.revision}: ${request.question}`,
    }),
  };
}

function harness(
  execute: AgentTalkieAdapter["execute"] = async (request) => completed(request),
  targets: AgentTarget[] = [agenttalkieFixtureTarget, agenttalkieUnavailableTarget],
  mode: "fixture" | "live" = "fixture",
) {
  const calls: WorkerRequest[] = [];
  const adapter: AgentTalkieAdapter = {
    targets,
    execute(request) {
      calls.push(structuredClone(request));
      return execute(request);
    },
  };
  const service = new AgentTalkieService({ adapters: [adapter], now: () => now });
  const initial = service.create(owner, mode);
  const input = SubmitRequestSchema.parse({
    ...agenttalkieFixtureRequest, sessionId: initial.session.id,
  });
  return { service, calls, input, initial };
}

function status(expected: number) {
  return (error: unknown) => error instanceof AgentTalkieError && error.status === expected;
}

test("completion preserves validated evidence and source time separately from retrieval time", async () => {
  const { service, input, initial } = harness(async (request) => {
    const outcome = completed(request);
    if (outcome.status !== "completed") throw new Error("Unexpected fixture outcome");
    outcome.result.evidence[0].sourceObservedAt = null;
    return outcome;
  });
  SessionSnapshotSchema.parse(initial);
  assert.equal(initial.currentResult, null);
  const submitted = service.submit(owner, input);
  assert.equal(submitted.snapshot.session.requests[0].state, "pending");
  await submitted.completion;
  const current = SessionSnapshotSchema.parse(service.snapshot(owner, input.sessionId));
  assert.equal(current.session.requests[0].state, "completed");
  assert.equal(current.currentResult?.revision, 1);
  assert.equal(current.currentResult?.evidence[0].kind, "fixture");
  assert.equal(current.currentResult?.evidence[0].sourceObservedAt, null);
  assert.equal(current.currentResult?.evidence[0].retrievedAt, "2026-09-12T19:01:00Z");
});

test("a correction wins even when the original result arrives last", async () => {
  const original = deferred<WorkerOutcome>();
  const corrected = deferred<WorkerOutcome>();
  const { service, input } = harness((request) =>
    request.revision === 1 ? original.promise : corrected.promise,
  );
  const first = service.submit(owner, input);
  const correction = { ...input, revision: 2, question: "Only tell me about staging blockers." };
  const second = service.submit(owner, correction);
  assert.equal(second.snapshot.session.activeRevision, 2);
  assert.equal(second.snapshot.session.requests[0].state, "superseded");
  corrected.resolve(completed(correction));
  await second.completion;
  original.resolve(completed(input));
  await first.completion;

  const snapshot = service.snapshot(owner, input.sessionId);
  assert.equal(snapshot.currentResult?.revision, 2);
  assert.match(snapshot.currentResult!.answer, /staging blockers/);
  assert.equal(snapshot.session.requests.length, 2);
  const old = snapshot.session.requests.find((request) => request.revision === 1)!;
  assert.equal(old.state, "superseded");
  assert.equal(old.result?.revision, 1);
});

test("late failure cannot replace a completed correction", async () => {
  const original = deferred<WorkerOutcome>();
  const { service, input } = harness((request) =>
    request.revision === 1 ? original.promise : Promise.resolve(completed(request)),
  );
  const first = service.submit(owner, input);
  const second = service.submit(owner, { ...input, revision: 2, question: "Updated scope" });
  await second.completion;
  original.resolve({ status: "failed", code: "WORKER_FAILED", message: "Original lookup failed." });
  await first.completion;
  const snapshot = service.snapshot(owner, input.sessionId);
  assert.equal(snapshot.currentResult?.revision, 2);
  assert.equal(snapshot.session.requests[0].state, "superseded");
  assert.equal(snapshot.session.requests[1].state, "completed");
});

test("identical pending and completed retries execute once and create one record", async () => {
  const work = deferred<WorkerOutcome>();
  const { service, calls, input } = harness(() => work.promise);
  const first = service.submit(owner, input);
  const retry = service.submit(owner, structuredClone(input));
  work.resolve(completed(input));
  await Promise.all([first.completion, retry.completion]);
  const completedRetry = service.submit(owner, structuredClone(input));
  await completedRetry.completion;
  assert.equal(calls.length, 1);
  assert.equal(service.snapshot(owner, input.sessionId).session.requests.length, 1);
  assert.equal(completedRetry.snapshot.currentResult?.revision, 1);
});

test("revision collisions and gaps cannot execute or advance the active request", async () => {
  const { service, calls, input } = harness();
  await service.submit(owner, input).completion;
  assert.throws(() => service.submit(owner, { ...input, question: "Changed under the same revision" }), status(409));
  assert.throws(() => service.submit(owner, { ...input, revision: 3, question: "Skipped revision" }), status(409));
  const corrected = { ...input, revision: 2, question: "Current scope" };
  await service.submit(owner, corrected).completion;
  await service.submit(owner, structuredClone(corrected)).completion;
  assert.equal(calls.length, 2);
  assert.equal(service.snapshot(owner, input.sessionId).session.activeRevision, 2);
});

test("a new request supersedes the old request without allowing it to be revived", async () => {
  const work = deferred<WorkerOutcome>();
  const { service, input, calls } = harness((request) =>
    request.requestId === agenttalkieFixtureRequest.requestId ? work.promise : Promise.resolve(completed(request)),
  );
  const first = service.submit(owner, input);
  const next = { ...input, requestId: otherRequestId, question: "Another project question" };
  await service.submit(owner, next).completion;
  assert.throws(() => service.submit(owner, { ...input, revision: 2, question: "Revive old request" }), status(409));
  work.resolve(completed(input));
  await first.completion;
  const snapshot = service.snapshot(owner, input.sessionId);
  assert.equal(snapshot.currentResult?.requestId, otherRequestId);
  assert.equal(snapshot.session.requests[0].state, "superseded");
  assert.equal(calls.length, 2);
});

test("invalid target combinations and malformed inputs fail before adapter execution", () => {
  const secondTarget: AgentTarget = {
    ...agenttalkieFixtureTarget, projectId: "another-project", agentId: "another-agent",
    workerSessionId: "fixture:another-session",
  };
  const { service, input, calls } = harness(undefined, [agenttalkieFixtureTarget, secondTarget]);
  for (const invalid of [
    { ...input, projectId: "unknown" },
    { ...input, agentId: "unknown" },
    { ...input, workerSessionId: "unknown" },
    { ...input, agentId: secondTarget.agentId, workerSessionId: secondTarget.workerSessionId },
    { ...input, question: " " },
    { ...input, question: "x".repeat(4001) },
    { ...input, extra: "unexpected" },
  ]) {
    assert.throws(() => service.submit(owner, invalid));
  }
  assert.equal(calls.length, 0);
  assert.equal(service.snapshot(owner, input.sessionId).session.requests.length, 0);
});

test("a worker result with mismatched request identity is never current", async () => {
  for (const mismatched of [
    { requestId: otherRequestId }, { revision: 2 }, { projectId: "another-project" },
    { agentId: "another-agent" }, { workerSessionId: "another-session" },
  ]) {
    const { service, input } = harness(async (request) => {
      const outcome = completed(request);
      if (outcome.status !== "completed") throw new Error("Unexpected fixture outcome");
      return { status: "completed", result: { ...outcome.result, ...mismatched } };
    });
    await service.submit(owner, input).completion;
    const snapshot = service.snapshot(owner, input.sessionId);
    assert.equal(snapshot.currentResult, null);
    assert.equal(snapshot.session.requests[0].state, "failed");
  }
});

test("fixture and live sessions reject evidence from the other mode", async () => {
  for (const mode of ["fixture", "live"] as const) {
    const target: AgentTarget = { ...agenttalkieFixtureTarget, evidenceMode: mode };
    const { service, input } = harness(async (request) => {
      const outcome = completed(request);
      if (outcome.status !== "completed") throw new Error("Unexpected fixture outcome");
      outcome.result.evidence[0].kind = mode === "fixture" ? "worker_reply" : "fixture";
      return outcome;
    }, [target], mode);
    await service.submit(owner, input).completion;
    const snapshot = service.snapshot(owner, input.sessionId);
    assert.equal(snapshot.currentResult, null);
    assert.equal(snapshot.session.requests[0].state, "failed");
  }
});

test("live sessions cannot route to fixture targets", () => {
  const { service, input, initial, calls } = harness(undefined, [agenttalkieFixtureTarget], "live");
  assert.equal(initial.targets.some((target) => target.evidenceMode === "fixture"), false);
  assert.throws(() => service.submit(owner, input));
  assert.equal(calls.length, 0);
});

test("a live source read keeps its evidence kind instead of becoming a worker reply", async () => {
  const target: AgentTarget = { ...agenttalkieFixtureTarget, evidenceMode: "live", provider: "offline-test-source" };
  const { service, input } = harness(async (request) => {
    const outcome = completed(request);
    if (outcome.status !== "completed") throw new Error("Unexpected fixture outcome");
    outcome.result.evidence = [{
      kind: "source_read", reference: "source:offline-test:checkpoint",
      sourceObservedAt: null, retrievedAt: now,
    }];
    return outcome;
  }, [target], "live");
  await service.submit(owner, input).completion;
  const snapshot = service.snapshot(owner, input.sessionId);
  assert.equal(snapshot.session.requests[0].state, "completed");
  assert.equal(snapshot.currentResult?.evidence[0].kind, "source_read");
  assert.equal(snapshot.currentResult?.evidence[0].sourceObservedAt, null);
});

test("a configured unavailable target remains unavailable without execution", async () => {
  const { service, input, calls } = harness();
  await service.submit(owner, {
    ...input, agentId: agenttalkieUnavailableTarget.agentId,
    workerSessionId: agenttalkieUnavailableTarget.workerSessionId,
  }).completion;
  const snapshot = service.snapshot(owner, input.sessionId);
  assert.equal(snapshot.session.requests[0].state, "unavailable");
  assert.equal(snapshot.currentResult, null);
  assert.equal(calls.length, 0);
});

test("unavailable worker outcomes and rejected execution do not produce successful results", async () => {
  for (const execute of [
    async (): Promise<WorkerOutcome> => ({ status: "unavailable", code: "NO_ROUTE", message: "Worker route unavailable." }),
    async (): Promise<WorkerOutcome> => { throw new Error("private provider details"); },
  ]) {
    const { service, input } = harness(execute);
    await service.submit(owner, input).completion;
    const snapshot = service.snapshot(owner, input.sessionId);
    assert.equal(snapshot.currentResult, null);
    assert.ok(["unavailable", "failed"].includes(snapshot.session.requests[0].state));
    assert.doesNotMatch(JSON.stringify(snapshot), /private provider details/);
  }
});

test("prepared followups bind the latest completed recipient and revision and never execute work", async () => {
  const { service, input, calls } = harness();
  const followup = { sessionId: input.sessionId, requestId: input.requestId, revision: 1, scope: "Check the remaining blockers." };
  assert.throws(() => service.prepare(owner, followup));
  await service.submit(owner, input).completion;
  const prepared = service.prepare(owner, followup);
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.recipient, agenttalkieFixtureTarget.agentName);
  assert.equal(prepared.workerSessionId, input.workerSessionId);
  assert.equal(prepared.revision, 1);
  assert.equal(calls.length, 1);

  const correction = service.submit(owner, { ...input, revision: 2, question: "Corrected scope" });
  assert.equal(correction.snapshot.session.preparedFollowup, null);
  assert.throws(() => service.prepare(owner, followup));
  await correction.completion;
  assert.throws(() => service.prepare(owner, followup));
  const latest = service.prepare(owner, { ...followup, revision: 2 });
  assert.equal(latest.revision, 2);
  assert.equal(latest.requestId, input.requestId);
  assert.equal(calls.length, 2);
});

test("ending a session prevents pending and late work from becoming current", async () => {
  const work = deferred<WorkerOutcome>();
  const { service, input } = harness(() => work.promise);
  const submitted = service.submit(owner, input);
  const ended = service.end(owner, input.sessionId);
  assert.equal(ended.session.status, "ended");
  assert.equal(ended.currentResult, null);
  assert.equal(ended.session.requests[0].state, "superseded");
  work.resolve(completed(input));
  await submitted.completion;
  const snapshot = service.snapshot(owner, input.sessionId);
  assert.equal(snapshot.currentResult, null);
  assert.equal(snapshot.session.requests[0].state, "superseded");
  assert.equal(snapshot.session.requests[0].result?.revision, 1);
  assert.throws(() => service.submit(owner, { ...input, revision: 2 }));
  assert.throws(() => service.prepare(owner, {
    sessionId: input.sessionId, requestId: input.requestId, revision: 1, scope: "Follow up",
  }));
});

test("another browser cannot inspect, submit, end, or prepare work in this session", () => {
  const { service, input, calls } = harness();
  for (const access of [
    () => service.snapshot("browser-two", input.sessionId),
    () => service.submit("browser-two", input),
    () => service.end("browser-two", input.sessionId),
    () => service.prepare("browser-two", {
      sessionId: input.sessionId, requestId: input.requestId, revision: 1, scope: "Follow up",
    }),
  ]) assert.throws(access, status(404));
  assert.equal(calls.length, 0);
  assert.equal(service.snapshot(owner, input.sessionId).session.status, "active");
});
