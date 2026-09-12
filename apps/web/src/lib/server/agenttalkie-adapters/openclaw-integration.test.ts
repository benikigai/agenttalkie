import assert from "node:assert/strict";
import test from "node:test";
import { agenttalkieFixtureRequest, agenttalkieFixtureTarget } from "../../agenttalkie-fixture";
import { AgentTalkieService } from "../agenttalkie-service";
import { createOpenClawAdapter } from "./openclaw";

test("a late mocked OpenClaw reply stays in history while the correction owns the answer and follow-up", async () => {
  const target = { ...agenttalkieFixtureTarget,
    workerSessionId: "agent:demo-worker:offline-integration-test",
    provider: "openclaw", evidenceMode: "live" as const,
  };
  let releaseOld!: (value: Response) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const oldResponse = new Promise<Response>((resolve) => { releaseOld = resolve; });
  let calls = 0;
  const reply = (id: string, content: string) => Response.json({
    id, object: "chat.completion",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
  });
  const adapter = createOpenClawAdapter({
    target,
    connection: { gatewayUrl: "http://127.0.0.1:18789", resolveToken: async () => "offline-test-token" },
    authorize: async () => true,
    fetch: async () => {
      calls += 1;
      if (calls === 1) { markStarted(); return oldResponse; }
      return reply("chatcmpl_test_revision_2", "Corrected scope: staging is blocked.");
    },
  });
  const service = new AgentTalkieService({ adapters: [adapter] });
  const owner = "offline-test-browser";
  const initial = service.create(owner, "live");
  const request = { ...agenttalkieFixtureRequest,
    workerSessionId: target.workerSessionId, sessionId: initial.session.id,
  };
  const old = service.submit(owner, request);
  await started;
  const current = service.submit(owner, { ...request, revision: 2, question: "Only staging blockers." });
  await current.completion;
  assert.equal(service.snapshot(owner, initial.session.id).currentResult?.revision, 2);

  releaseOld(reply("chatcmpl_test_revision_1", "Old scope: all projects are healthy."));
  await old.completion;
  const snapshot = service.snapshot(owner, initial.session.id);
  assert.equal(snapshot.currentResult?.answer, "Corrected scope: staging is blocked.");
  assert.equal(snapshot.session.requests[0].state, "superseded");
  assert.equal(snapshot.session.requests[0].result?.answer, "Old scope: all projects are healthy.");
  assert.equal(snapshot.session.requests[0].result?.evidence[0].kind, "worker_reply");
  assert.equal(snapshot.session.requests[1].state, "completed");
  assert.equal(snapshot.currentResult?.workerSessionId, target.workerSessionId);
  assert.equal(calls, 2);

  const followup = service.prepare(owner, {
    sessionId: initial.session.id, requestId: request.requestId, revision: 2,
    scope: "Prepare the staging blocker review.",
  });
  assert.equal(followup.status, "prepared");
  assert.equal(followup.workerSessionId, target.workerSessionId);
  assert.equal(followup.recipient, target.agentName);
  assert.equal(followup.revision, 2);
  assert.equal(calls, 2, "preparing the follow-up must not dispatch to OpenClaw");
  assert.throws(() => service.prepare(owner, {
    sessionId: initial.session.id, requestId: request.requestId, revision: 1, scope: "Old scope",
  }));
});

test("a selected but unconfigured OpenClaw target is unavailable through the backend", async () => {
  const target = { ...agenttalkieFixtureTarget,
    workerSessionId: "agent:demo-worker:offline-unavailable-test",
    provider: "openclaw", evidenceMode: "live" as const,
  };
  const adapter = createOpenClawAdapter({ target, fetch: async () => { throw new Error("Unexpected network request"); } });
  const service = new AgentTalkieService({ adapters: [adapter] });
  const initial = service.create("offline-owner", "live");
  const request = service.submit("offline-owner", { ...agenttalkieFixtureRequest,
    sessionId: initial.session.id, workerSessionId: target.workerSessionId,
  });
  await request.completion;
  const result = service.snapshot("offline-owner", initial.session.id);
  assert.equal(result.targets[0].availability, "unavailable");
  assert.equal(result.session.requests[0].state, "unavailable");
  assert.equal(result.currentResult, null);
  assert.equal(result.session.requests[0].result, null);
});
