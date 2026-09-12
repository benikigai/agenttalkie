import assert from "node:assert/strict";
import test from "node:test";
import { WorkerOutcomeSchema, type AgentTarget, type WorkerOutcome, type WorkerRequest } from "../../agenttalkie-contract";
import { agenttalkieFixtureRequest, agenttalkieFixtureTarget } from "../../agenttalkie-fixture";
import { createOpenClawAdapter } from "./openclaw";

const observedNow = "2026-09-12T20:00:00Z";
const token = "synthetic-test-token-never-log";
const target: AgentTarget = {
  ...agenttalkieFixtureTarget,
  workerSessionId: "agent:demo-worker:agenttalkie-test",
  provider: "openclaw",
  evidenceMode: "live",
};
const request: WorkerRequest = { ...agenttalkieFixtureRequest, workerSessionId: target.workerSessionId };

function completion() {
  return {
    id: "chatcmpl-test/one",
    object: "chat.completion",
    created: 1789236000,
    model: "existing-provider-unchanged",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "The selected session reports one blocker." } }],
  };
}

type Options = NonNullable<Parameters<typeof createOpenClawAdapter>[0]>;
function harness(overrides: Partial<Options> = {}) {
  const calls: { input: Parameters<typeof fetch>[0]; init?: RequestInit }[] = [];
  const events: string[] = [];
  const authorized: WorkerRequest[] = [];
  const adapter = createOpenClawAdapter({
    target,
    connection: { gatewayUrl: "http://127.0.0.1:18789", resolveToken: async () => { events.push("token"); return token; } },
    authorize: async (input) => { events.push("authorize"); authorized.push(structuredClone(input)); return true; },
    fetch: async (input, init) => { events.push("fetch"); calls.push({ input, init }); return Response.json(completion()); },
    now: () => observedNow,
    ...overrides,
  });
  return { adapter, calls, events, authorized };
}

function assertFailure(outcome: WorkerOutcome, code?: string) {
  WorkerOutcomeSchema.parse(outcome);
  assert.notEqual(outcome.status, "completed");
  if (outcome.status === "completed") throw new Error("Expected a typed failure");
  if (code) assert.equal(outcome.code, code);
  assert.doesNotMatch(JSON.stringify(outcome), /synthetic-test-token-never-log|raw-gateway-secret|private-exception-detail/);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

test("an unconfigured adapter exposes no invented target or session", async () => {
  const adapter = createOpenClawAdapter();
  assert.deepEqual(adapter.targets, []);
  const outcome = await adapter.execute(request);
  assertFailure(outcome, "OPENCLAW_TARGET_NOT_CONFIGURED");
  assert.equal(outcome.status, "unavailable");
});

test("missing connection or authorizer marks the target unavailable without transport", async (t) => {
  for (const missing of ["connection", "authorize"] as const) {
    await t.test(missing, async () => {
      const { adapter, calls, events } = harness({ [missing]: undefined });
      assert.equal(adapter.targets.length, 1);
      assert.equal(adapter.targets[0].availability, "unavailable");
      assert.ok(adapter.targets[0].unavailableReason);
      const outcome = await adapter.execute(request);
      assertFailure(outcome);
      assert.equal(outcome.status, "unavailable");
      assert.deepEqual(calls, []);
      assert.ok(!events.includes("token"));
    });
  }
});

test("fixture target configuration cannot invoke an existing worker", async () => {
  let fetches = 0;
  let adapter: ReturnType<typeof createOpenClawAdapter>;
  try {
    adapter = createOpenClawAdapter({
      target: agenttalkieFixtureTarget,
      connection: { gatewayUrl: "http://127.0.0.1:18789", resolveToken: async () => token },
      authorize: async () => true,
      fetch: async () => { fetches += 1; return Response.json(completion()); },
    });
  } catch {
    assert.equal(fetches, 0);
    return;
  }
  assert.ok(adapter.targets.every((entry) => entry.availability === "unavailable"));
  assertFailure(await adapter.execute(agenttalkieFixtureRequest));
  assert.equal(fetches, 0);
});

test("unsafe origins and ambiguous session identities fail before transport", () => {
  for (const gatewayUrl of [
    "http://worker.example.test", "https://token@worker.example.test", "https://worker.example.test/custom-path",
    "https://worker.example.test?token=private", "https://worker.example.test#fragment",
  ]) {
    assert.throws(() => harness({ connection: { gatewayUrl, resolveToken: async () => token } }));
  }
  for (const workerSessionId of ["agent:another-agent:existing-session", "cron:scheduled", "agent:demo-worker:subagent:child", "session\r\ninjected"]) {
    assert.throws(() => harness({ target: { ...target, workerSessionId } }));
  }
});

test("an explicitly unavailable target cannot authorize or dispatch", async () => {
  const { adapter, events, calls } = harness({ target: { ...target, availability: "unavailable", unavailableReason: "Synthetic offline worker" } });
  assertFailure(await adapter.execute(request), "OPENCLAW_WORKER_UNAVAILABLE");
  assert.equal(adapter.targets[0].availability, "unavailable");
  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
});

test("unavailable target reasons remain valid bounded worker outcomes", async (t) => {
  for (const [name, unavailableReason] of [
    ["empty", ""], ["whitespace", " \n\t "], ["missing", null],
    ["oversized", "x".repeat(4001)], ["surrounding whitespace", "  Synthetic offline worker  "],
  ] as const) {
    await t.test(name, async () => {
      const { adapter, events, calls } = harness({ target: { ...target, availability: "unavailable", unavailableReason } });
      const outcome = await adapter.execute(request);
      WorkerOutcomeSchema.parse(outcome);
      assertFailure(outcome, "OPENCLAW_WORKER_UNAVAILABLE");
      assert.equal(outcome.status, "unavailable");
      assert.ok(outcome.message.length >= 1 && outcome.message.length <= 2000);
      assert.equal(outcome.message, outcome.message.trim());
      assert.equal(adapter.targets[0].unavailableReason, outcome.message);
      if (name === "oversized") assert.equal(outcome.message, "x".repeat(2000));
      if (name === "surrounding whitespace") assert.equal(outcome.message, "Synthetic offline worker");
      assert.deepEqual(events, []);
      assert.deepEqual(calls, []);
    });
  }
});

test("invalid request identity and empty questions fail before authorization", async (t) => {
  for (const input of [{ ...request, revision: 0 }, { ...request, requestId: "not-a-uuid" }, { ...request, question: "   " }]) {
    await t.test("invalid request", async () => {
      const { adapter, events, calls } = harness();
      assertFailure(await adapter.execute(input), "INVALID_WORKER_REQUEST");
      assert.deepEqual(events, []);
      assert.deepEqual(calls, []);
    });
  }
});

test("project, agent, and session mismatches fail before authorization, secrets, or fetch", async (t) => {
  for (const key of ["projectId", "agentId", "workerSessionId"] as const) {
    await t.test(key, async () => {
      const { adapter, calls, events } = harness();
      assertFailure(await adapter.execute({ ...request, [key]: "another-target" }), "TARGET_NOT_ALLOWED");
      assert.deepEqual(events, []);
      assert.deepEqual(calls, []);
    });
  }
});

test("authorization receives the exact request and denial cannot resolve credentials", async () => {
  const received: WorkerRequest[] = [];
  const { adapter, events, calls } = harness({ authorize: async (input) => { received.push(structuredClone(input)); return false; } });
  assertFailure(await adapter.execute(request));
  assert.deepEqual(received, [request]);
  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
});

test("authorization failure is normalized without leaking exception text or using transport", async () => {
  const { adapter, events, calls } = harness({ authorize: async () => { throw new Error("private-exception-detail"); } });
  assertFailure(await adapter.execute(request));
  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
});

test("one authorized request preserves the selected session and existing provider", async () => {
  const { adapter, calls, events, authorized } = harness();
  const outcome = await adapter.execute(request);
  assert.equal(outcome.status, "completed");
  assert.deepEqual(events, ["authorize", "token", "fetch"]);
  assert.deepEqual(authorized, [request]);
  assert.equal(calls.length, 1);
  const { input, init } = calls[0];
  assert.equal(String(input), "http://127.0.0.1:18789/v1/chat/completions");
  assert.equal(init?.method, "POST");
  assert.equal(init?.redirect, "error");
  assert.equal(init?.cache, "no-store");
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${token}`);
  assert.equal(headers.get("x-openclaw-agent-id"), target.agentId);
  assert.equal(headers.get("x-openclaw-session-key"), target.workerSessionId);
  assert.equal(headers.get("x-openclaw-model"), null);
  assert.deepEqual(JSON.parse(String(init?.body)), {
    model: `openclaw:${target.agentId}`,
    stream: false,
    messages: [{ role: "user", content: request.question }],
  });
  WorkerOutcomeSchema.parse(outcome);
  if (outcome.status !== "completed") throw new Error("Expected completed outcome");
  const { question: _question, ...identity } = request;
  assert.deepEqual(outcome.result, {
    ...identity,
    answer: completion().choices[0].message.content,
    evidence: [{
      kind: "worker_reply",
      reference: `urn:openclaw:session:${encodeURIComponent(target.workerSessionId)}:completion:${encodeURIComponent(completion().id)}`,
      sourceObservedAt: null,
      retrievedAt: observedNow,
    }],
  });
});

test("credential failures are normalized without calling the gateway", async (t) => {
  for (const resolveToken of [async () => "", async () => { throw new Error(`private-exception-detail ${token}`); }]) {
    await t.test("unavailable credential", async () => {
      const { adapter, calls } = harness({ connection: { gatewayUrl: "http://127.0.0.1:18789", resolveToken } });
      assertFailure(await adapter.execute(request));
      assert.deepEqual(calls, []);
    });
  }
});

test("HTTP errors never expose gateway text or report completion", async (t) => {
  for (const status of [202, 301, 401, 403, 404, 429, 500]) {
    await t.test(String(status), async () => {
      let fetches = 0;
      const { adapter } = harness({ fetch: async () => { fetches += 1; return new Response(`raw-gateway-secret ${token}`, { status }); } });
      assertFailure(await adapter.execute(request));
      assert.equal(fetches, 1);
    });
  }
});

test("malformed and unfinished completions cannot become worker evidence", async (t) => {
  const valid = completion();
  const first = valid.choices[0];
  const invalid = [
    ["missing completion ID", { ...valid, id: "" }],
    ["wrong response object", { ...valid, object: "chat.completion.chunk" }],
    ["no choices", { ...valid, choices: [] }],
    ["multiple choices", { ...valid, choices: [first, { ...first, index: 1 }] }],
    ["wrong choice index", { ...valid, choices: [{ ...first, index: 1 }] }],
    ["partial finish", { ...valid, choices: [{ ...first, finish_reason: "length" }] }],
    ["missing finish", { ...valid, choices: [{ ...first, finish_reason: null }] }],
    ["tool finish", { ...valid, choices: [{ ...first, finish_reason: "tool_calls" }] }],
    ["wrong role", { ...valid, choices: [{ ...first, message: { ...first.message, role: "user" } }] }],
    ["empty answer", { ...valid, choices: [{ ...first, message: { ...first.message, content: "" } }] }],
    ["whitespace answer", { ...valid, choices: [{ ...first, message: { ...first.message, content: " \n " } }] }],
    ["array answer", { ...valid, choices: [{ ...first, message: { ...first.message, content: [{ type: "text", text: "unverified" }] } }] }],
    ["tool call with prose", { ...valid, choices: [{ ...first, message: { ...first.message, tool_calls: [{ id: "call-1", type: "function", function: { name: "send", arguments: "{}" } }] } }] }],
    ["legacy function call with prose", { ...valid, choices: [{ ...first, message: { ...first.message, function_call: { name: "send", arguments: "{}" } } }] }],
    ["error envelope with prose", { ...valid, error: { message: "raw-gateway-secret" } }],
  ] as const;
  for (const [name, body] of invalid) {
    await t.test(name, async () => {
      const { adapter } = harness({ fetch: async () => Response.json(body) });
      const outcome = await adapter.execute(request);
      assertFailure(outcome, "OPENCLAW_INVALID_REPLY");
      assert.equal(outcome.status, "unavailable");
    });
  }
  await t.test("invalid JSON", async () => {
    const { adapter } = harness({ fetch: async () => new Response("raw-gateway-secret {broken") });
    const outcome = await adapter.execute(request);
    assertFailure(outcome, "OPENCLAW_INVALID_REPLY");
    assert.equal(outcome.status, "unavailable");
  });
  await t.test("oversized response", async () => {
    const { adapter } = harness({ fetch: async () => Response.json({ ...valid, padding: "x".repeat(128 * 1024) }) });
    const outcome = await adapter.execute(request);
    assertFailure(outcome, "OPENCLAW_INVALID_REPLY");
    assert.equal(outcome.status, "unavailable");
  });
});

test("an invalid HTTP 200 reply retains unknown completion and cannot retry the admitted turn", async () => {
  let fetches = 0;
  const { adapter } = harness({ fetch: async () => { fetches += 1; return Response.json({ id: "chatcmpl-partial", object: "chat.completion", choices: [] }); } });
  const outcome = await adapter.execute(request);
  WorkerOutcomeSchema.parse(outcome);
  assertFailure(outcome, "OPENCLAW_INVALID_REPLY");
  assert.equal(outcome.status, "unavailable");
  assert.match(outcome.message, /completion is unknown/i);
  assert.deepEqual(await adapter.execute({ ...request }), outcome);
  assert.equal(fetches, 1);
});

test("transport exceptions preserve unknown delivery without leaking or retrying", async () => {
  let fetches = 0;
  const { adapter } = harness({ fetch: async () => { fetches += 1; throw new Error(`private-exception-detail ${token}`); } });
  const outcome = await adapter.execute(request);
  assertFailure(outcome, "OPENCLAW_DELIVERY_UNKNOWN");
  assert.equal(outcome.status, "unavailable");
  assert.deepEqual(await adapter.execute(request), outcome);
  assert.equal(fetches, 1);
});

test("a pending gateway request times out once and is never retried", async () => {
  let fetches = 0;
  const { adapter } = harness({
    timeoutMs: 15,
    fetch: async (_input, init) => {
      fetches += 1;
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        assert.ok(signal);
        signal.addEventListener("abort", () => reject(new Error(`private-exception-detail ${token}`)), { once: true });
      });
    },
  });
  const outcome = await adapter.execute(request);
  assertFailure(outcome, "OPENCLAW_DELIVERY_UNKNOWN");
  assert.equal(outcome.status, "unavailable");
  assert.deepEqual(await adapter.execute(request), outcome);
  assert.equal(fetches, 1);
});

test("late authorization or credential resolution after preparation timeout cannot dispatch", async (t) => {
  await t.test("authorization", async () => {
    const approval = deferred<boolean>();
    const { adapter, events, calls } = harness({ timeoutMs: 10, authorize: async () => approval.promise });
    const outcome = await adapter.execute(request);
    assertFailure(outcome, "OPENCLAW_PREPARATION_TIMEOUT");
    approval.resolve(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(events, []);
    assert.deepEqual(calls, []);
    assert.deepEqual(await adapter.execute(request), outcome);
  });
  await t.test("credential", async () => {
    const credential = deferred<string>();
    const { adapter, events, calls } = harness({
      timeoutMs: 10,
      connection: { gatewayUrl: "http://127.0.0.1:18789", resolveToken: async () => credential.promise },
    });
    const outcome = await adapter.execute(request);
    assertFailure(outcome, "OPENCLAW_PREPARATION_TIMEOUT");
    credential.resolve(token);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["authorize"]);
    assert.deepEqual(calls, []);
    assert.deepEqual(await adapter.execute(request), outcome);
  });
});

test("concurrent identical requests and later retries reuse one admitted turn", async () => {
  let fetches = 0;
  const response = deferred<Response>();
  const { adapter, authorized, events } = harness({ fetch: async () => { fetches += 1; return response.promise; } });
  const first = adapter.execute(request);
  const second = adapter.execute({ ...request });
  response.resolve(Response.json(completion()));
  const outcomes = await Promise.all([first, second]);
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.equal(outcomes[0].status, "completed");
  assert.equal(fetches, 1);
  assert.equal(authorized.length, 1);
  assert.equal(events.filter((entry) => entry === "token").length, 1);
  assert.deepEqual(await adapter.execute({ ...request }), outcomes[0]);
  assert.equal(fetches, 1);
});

test("changed question under an existing request revision fails without another dispatch", async () => {
  const response = deferred<Response>();
  let fetches = 0;
  const { adapter } = harness({ fetch: async () => { fetches += 1; return response.promise; } });
  const first = adapter.execute(request);
  assertFailure(await adapter.execute({ ...request, question: "A different question at the same revision" }), "REQUEST_CONFLICT");
  response.resolve(Response.json(completion()));
  assert.equal((await first).status, "completed");
  assert.equal(fetches, 1);
});

test("a correction at the next revision receives its own request-bound result", async () => {
  const { adapter, calls, authorized } = harness();
  await adapter.execute(request);
  const revised = { ...request, revision: request.revision + 1, question: "Only staging blockers." };
  const outcome = await adapter.execute(revised);
  assert.equal(calls.length, 2);
  assert.deepEqual(authorized, [request, revised]);
  assert.equal(outcome.status, "completed");
  if (outcome.status === "completed") assert.equal(outcome.result.revision, revised.revision);
});
