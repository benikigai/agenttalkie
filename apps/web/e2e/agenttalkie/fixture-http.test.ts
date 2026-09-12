import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  AGENTTALKIE_CONTRACT_VERSION, AGENTTALKIE_ROUTES, ApiErrorSchema,
  PreparedFollowupSchema, SessionSnapshotSchema,
  type AgentTarget, type SessionSnapshot,
} from "../../src/lib/agenttalkie-contract";
import {
  agenttalkieFixtureRequest, agenttalkieFixtureTarget, agenttalkieUnavailableTarget,
} from "../../src/lib/agenttalkie-fixture";

const base = new URL(process.env.AGENTTALKIE_BASE_URL ?? "http://127.0.0.1:3100");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Fixture acceptance requires the shared loopback server.");
assert.equal(base.username + base.password + base.search + base.hash, "", "Use a URL without credentials or query parameters.");

class BrowserSession {
  private cookie = "";

  async call(path: string, body?: unknown) {
    const response = await fetch(new URL(path, base), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: base.origin,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    assert.match(response.headers.get("content-type") ?? "", /application\/json/, `Expected JSON from ${path}; got HTTP ${response.status}.`);
    return { status: response.status, body: await response.json() };
  }

  async create() {
    const boot = await this.call(AGENTTALKIE_ROUTES.session);
    assert.equal(boot.status, 200);
    assert.equal(boot.body.contractVersion, AGENTTALKIE_CONTRACT_VERSION);
    const created = await this.call(AGENTTALKIE_ROUTES.session, { operation: "create", mode: "fixture" });
    assert.equal(created.status, 201);
    const snapshot = SessionSnapshotSchema.parse(created.body);
    assert.equal(snapshot.session.mode, "fixture");
    assert.ok(snapshot.targets.some((item) => item.workerSessionId === agenttalkieFixtureTarget.workerSessionId));
    return snapshot.session.id;
  }

  async snapshot(sessionId: string) {
    const response = await this.call(`${AGENTTALKIE_ROUTES.session}?sessionId=${encodeURIComponent(sessionId)}`);
    assert.equal(response.status, 200);
    return SessionSnapshotSchema.parse(response.body);
  }

  async until(sessionId: string, predicate: (snapshot: SessionSnapshot) => boolean) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const snapshot = await this.snapshot(sessionId);
      if (predicate(snapshot)) return snapshot;
      await delay(60);
    }
    assert.fail("Expected fixture state did not arrive within 10 seconds.");
  }

  async end(sessionId: string) {
    const response = await this.call(AGENTTALKIE_ROUTES.session, { operation: "end", sessionId });
    assert.equal(response.status, 200);
    return SessionSnapshotSchema.parse(response.body);
  }
}

function question(sessionId: string, requestId: string, revision: number, text: string, target: AgentTarget = agenttalkieFixtureTarget) {
  return {
    sessionId, requestId, revision, question: text,
    projectId: target.projectId, agentId: target.agentId, workerSessionId: target.workerSessionId,
  };
}

function expectError(response: { status: number; body: unknown }, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(ApiErrorSchema.parse(response.body).error.code, code);
}

test("AgentTalkie shared HTTP fixture acceptance (no voice or external worker calls)", { timeout: 60000 }, async (t) => {
  await t.test("A03/A04/A09: correction overtakes old result and follow-up stays current", async () => {
    const browser = new BrowserSession();
    const sessionId = await browser.create();
    try {
      // Warm the route before measuring the deliberately short fixture race.
      const warmup = question(sessionId, randomUUID(), 1, agenttalkieFixtureRequest.question);
      assert.equal((await browser.call(AGENTTALKIE_ROUTES.requests, warmup)).status, 202);
      await browser.until(sessionId, (s) => s.currentResult?.requestId === warmup.requestId);

      const requestId = randomUUID();
      const first = question(sessionId, requestId, 1, agenttalkieFixtureRequest.question);
      const second = question(sessionId, requestId, 2, "Only the existing worker connection. What is the next verification step?");
      const pending = await browser.call(AGENTTALKIE_ROUTES.requests, first);
      assert.equal(pending.status, 202);
      assert.equal(SessionSnapshotSchema.parse(pending.body).currentResult, null);
      const corrected = await browser.call(AGENTTALKIE_ROUTES.requests, second);
      assert.equal(corrected.status, 202);
      const admitted = SessionSnapshotSchema.parse(corrected.body);
      assert.equal(admitted.session.activeRequestId, requestId);
      assert.equal(admitted.session.activeRevision, 2);
      assert.equal(admitted.currentResult, null);
      const earlier = admitted.session.requests.find((r) => r.requestId === requestId && r.revision === 1);
      assert.equal(earlier?.state, "superseded");
      assert.equal(earlier.result, null, "Correction must be admitted before old result arrives.");

      const revised = await browser.until(sessionId, (s) => s.currentResult?.requestId === requestId && s.currentResult.revision === 2);
      assert.equal(revised.session.requests.find((r) => r.requestId === requestId && r.revision === 1)?.result, null, "Observe corrected result before releasing old result.");
      const settled = await browser.until(sessionId, (s) => Boolean(s.session.requests.find((r) => r.requestId === requestId && r.revision === 1)?.result));
      assert.equal(settled.currentResult?.requestId, requestId);
      assert.equal(settled.currentResult?.revision, 2);
      const old = settled.session.requests.find((r) => r.requestId === requestId && r.revision === 1);
      assert.equal(old?.state, "superseded");
      assert.equal(old.result?.revision, 1);
      assert.ok(settled.currentResult.answer.includes(second.question));
      assert.ok(settled.currentResult.evidence.every((e) => e.kind === "fixture"));
      assert.equal(settled.currentResult.workerSessionId, agenttalkieFixtureTarget.workerSessionId);

      const proposal = { sessionId, requestId, revision: 2, scope: "Verify the existing worker connection and report the next step." };
      const prepared = await browser.call(AGENTTALKIE_ROUTES.followup, proposal);
      assert.equal(prepared.status, 200);
      const followup = PreparedFollowupSchema.parse(prepared.body.followup);
      assert.equal(followup.status, "prepared");
      assert.equal(followup.recipient, agenttalkieFixtureTarget.agentName);
      assert.equal(followup.workerSessionId, agenttalkieFixtureTarget.workerSessionId);
      assert.equal(followup.requestId, requestId);
      assert.equal(followup.revision, 2);
      assert.equal(followup.scope, proposal.scope);
      expectError(await browser.call(AGENTTALKIE_ROUTES.followup, { ...proposal, revision: 1 }), 409, "STALE_FOLLOWUP");

      const third = question(sessionId, requestId, 3, "Only report the verified next step.");
      assert.equal((await browser.call(AGENTTALKIE_ROUTES.requests, third)).status, 202);
      assert.equal((await browser.snapshot(sessionId)).session.preparedFollowup, null);
      expectError(await browser.call(AGENTTALKIE_ROUTES.followup, proposal), 409, "STALE_FOLLOWUP");
    } finally {
      await browser.end(sessionId);
    }
  });

  await t.test("A10: exact retry, conflicting body and disallowed target", async () => {
    const browser = new BrowserSession();
    const sessionId = await browser.create();
    try {
      const first = question(sessionId, randomUUID(), 1, agenttalkieFixtureRequest.question);
      assert.equal((await browser.call(AGENTTALKIE_ROUTES.requests, first)).status, 202);
      const retry = await browser.call(AGENTTALKIE_ROUTES.requests, first);
      assert.ok([200, 202].includes(retry.status));
      assert.equal(SessionSnapshotSchema.parse(retry.body).session.requests.length, 1);
      expectError(await browser.call(AGENTTALKIE_ROUTES.requests, { ...first, question: "Conflicting text." }), 409, "REQUEST_CONFLICT");
      expectError(await browser.call(AGENTTALKIE_ROUTES.requests, { ...first, revision: 3 }), 409, "STALE_REVISION");
      expectError(await browser.call(AGENTTALKIE_ROUTES.requests, { ...first, workerSessionId: "fixture:not-allowed" }), 403, "TARGET_NOT_ALLOWED");
      const snapshot = await browser.snapshot(sessionId);
      assert.equal(snapshot.session.requests.length, 1);
      assert.equal(snapshot.session.activeRevision, 1);
    } finally {
      await browser.end(sessionId);
    }
  });

  await t.test("A06: unavailable worker has a reason and no current answer", async () => {
    const browser = new BrowserSession();
    const sessionId = await browser.create();
    try {
      const input = question(sessionId, randomUUID(), 1, "What is the current status?", agenttalkieUnavailableTarget);
      const response = await browser.call(AGENTTALKIE_ROUTES.requests, input);
      assert.ok([200, 202].includes(response.status));
      const snapshot = await browser.until(sessionId, (s) => s.session.requests[0]?.state === "unavailable");
      assert.equal(snapshot.currentResult, null);
      assert.equal(snapshot.session.requests[0].result, null);
      assert.equal(snapshot.session.requests[0].error?.code, "WORKER_UNAVAILABLE");
      assert.ok(snapshot.session.requests[0].error?.message);
    } finally {
      await browser.end(sessionId);
    }
  });

  await t.test("A08: ending pending work prevents late current result and further questions", async () => {
    const browser = new BrowserSession();
    const sessionId = await browser.create();
    try {
      const input = question(sessionId, randomUUID(), 1, agenttalkieFixtureRequest.question);
      assert.equal((await browser.call(AGENTTALKIE_ROUTES.requests, input)).status, 202);
      const ended = await browser.end(sessionId);
      assert.equal(ended.session.status, "ended");
      assert.equal(ended.currentResult, null);
      assert.equal(ended.session.requests[0].state, "superseded");
      const settled = await browser.until(sessionId, (s) => Boolean(s.session.requests[0]?.result));
      assert.equal(settled.currentResult, null);
      assert.equal(settled.session.requests[0].state, "superseded");
      expectError(await browser.call(AGENTTALKIE_ROUTES.requests, { ...input, revision: 2 }), 409, "SESSION_ENDED");
    } finally {
      await browser.end(sessionId);
    }
  });
});
