import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AGENTTALKIE_ROUTES, SessionSnapshotSchema, type SessionSnapshot } from "../src/lib/agenttalkie-contract";

const origin = "http://127.0.0.1:3100";
let cookie = "";
async function request(path: string, body?: unknown, expected = 200) {
  const response = await fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    headers: { cookie, ...(body ? { origin, "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
  return value;
}

async function main() {
  await request(AGENTTALKIE_ROUTES.session);
  assert.ok(cookie);
  const created = SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.session, { operation: "create", mode: "fixture" }, 201));
  const target = created.targets.find((item) => item.evidenceMode === "fixture" && item.availability === "available")!;
  assert.ok(target);
  const unavailable = created.targets.find((item) => item.evidenceMode === "fixture" && item.availability === "unavailable")!;
  assert.ok(unavailable);
  const sessionId = created.session.id;
  const first = { sessionId, requestId: randomUUID(), revision: 1, projectId: target.projectId, agentId: target.agentId, workerSessionId: target.workerSessionId, question: "What blocks the demo?" };
  await request(AGENTTALKIE_ROUTES.requests, first, 202);
  const corrected = { ...first, revision: 2, question: "Focus on the existing worker session." };
  await request(AGENTTALKIE_ROUTES.requests, corrected, 202);
  await request(AGENTTALKIE_ROUTES.requests, { ...corrected, question: "Conflicting duplicate" }, 409);

  async function waitFor(predicate: (snapshot: SessionSnapshot) => boolean) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const snapshot = SessionSnapshotSchema.parse(await request(`${AGENTTALKIE_ROUTES.session}?sessionId=${sessionId}`));
      if (predicate(snapshot)) return snapshot;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("Timed out waiting for fixture state.");
  }

  const settled = await waitFor((snapshot) => snapshot.session.requests.every((item) => item.result !== null));
  assert.equal(settled.currentResult?.revision, 2);
  assert.equal(settled.session.requests[0].state, "superseded");
  assert.equal(settled.session.requests[0].result?.revision, 1);
  assert.ok(settled.currentResult?.evidence.every((item) => item.kind === "fixture"));
  await request(AGENTTALKIE_ROUTES.requests, corrected);
  await request(AGENTTALKIE_ROUTES.requests, { ...corrected, revision: 3, projectId: "not-allowed" }, 403);
  await request(AGENTTALKIE_ROUTES.followup, { sessionId, requestId: first.requestId, revision: 1, scope: "Obsolete followup" }, 409);
  const { followup } = await request(AGENTTALKIE_ROUTES.followup, { sessionId, requestId: first.requestId, revision: 2, scope: "Verify the existing worker route." });
  assert.equal(followup.status, "prepared");
  assert.equal(followup.workerSessionId, target.workerSessionId);
  assert.equal(followup.recipient, target.agentName);

  const missing = { ...first, requestId: randomUUID(), agentId: unavailable.agentId, workerSessionId: unavailable.workerSessionId };
  await request(AGENTTALKIE_ROUTES.requests, missing, 202);
  const unavailableSnapshot = await waitFor((snapshot) => snapshot.session.requests.at(-1)?.state === "unavailable");
  assert.equal(unavailableSnapshot.currentResult, null);
  assert.equal(unavailableSnapshot.session.preparedFollowup, null);
  // Fixture mode fails before the live voice provider boundary, even if credentials exist.
  await request(AGENTTALKIE_ROUTES.voice, { sessionId, sdp: "fixture-smoke-no-provider-call" }, 409);
  const ended = SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.session, { operation: "end", sessionId }));
  assert.equal(ended.session.status, "ended");
  assert.equal(ended.currentResult, null);
  await request(AGENTTALKIE_ROUTES.requests, { ...first, requestId: randomUUID() }, 409);
  cookie = "";
  await request(`${AGENTTALKIE_ROUTES.session}?sessionId=${sessionId}`, undefined, 404);
  console.log(JSON.stringify({
    observedAt: new Date().toISOString(), url: origin, evidenceMode: "fixture", passed: true,
    checks: ["browser session", "pending request", "correction", "late history", "duplicate conflict", "exact retry", "target allowlist", "current-only followup", "unavailable worker", "voice fixture rejection", "end", "owner isolation"],
  }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
