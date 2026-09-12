import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientFixtureError, createClientFixtureSession, endClientFixtureSession,
  prepareClientFixtureFollowup, readClientFixtureSession, submitClientFixtureQuestion,
} from "./client/agenttalkie-fixture-client";
import { agenttalkieFixtureTarget, agenttalkieUnavailableTarget } from "./agenttalkie-fixture";

const identity = {
  requestId: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  projectId: agenttalkieFixtureTarget.projectId,
  agentId: agenttalkieFixtureTarget.agentId,
  workerSessionId: agenttalkieFixtureTarget.workerSessionId,
  question: "What blocks the demo?",
};

function expectCode(operation: () => unknown, code: string) {
  assert.throws(operation, (error) => error instanceof ClientFixtureError && error.code === code);
}

test("client fixture sessions preserve correction authority, idempotency, followups, and end state", () => {
  const created = createClientFixtureSession();
  assert.equal(created.session.requests.length, 0);
  assert.equal(created.currentResult, null);

  const first = submitClientFixtureQuestion(created.session.id, identity);
  assert.equal(first.currentResult?.requestId, identity.requestId);
  assert.equal(first.currentResult?.evidence[0]?.kind, "fixture");
  assert.equal(first.session.requests.length, 1);
  assert.equal(submitClientFixtureQuestion(created.session.id, identity).session.requests.length, 1);
  expectCode(() => submitClientFixtureQuestion(created.session.id, { ...identity, question: "Conflicting duplicate" }), "REQUEST_CONFLICT");

  const correction = { ...identity, revision: 2, question: "Focus on serverless state." };
  const corrected = submitClientFixtureQuestion(created.session.id, correction);
  assert.equal(corrected.session.requests[0]?.state, "superseded");
  assert.equal(corrected.currentResult?.revision, 2);
  expectCode(() => prepareClientFixtureFollowup(created.session.id, identity.requestId, 1, "Obsolete"), "STALE_FOLLOWUP");

  const prepared = prepareClientFixtureFollowup(created.session.id, identity.requestId, 2, "Verify the public fixture.");
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.recipient, agenttalkieFixtureTarget.agentName);
  assert.equal(readClientFixtureSession(created.session.id).session.preparedFollowup?.scope, "Verify the public fixture.");

  const ended = endClientFixtureSession(created.session.id);
  assert.equal(ended.session.status, "ended");
  assert.equal(ended.currentResult, null);
  expectCode(() => submitClientFixtureQuestion(created.session.id, { ...identity, requestId: "10000000-0000-4000-8000-000000000002" }), "SESSION_ENDED");
});

test("client fixture sessions report unavailable workers without fabricating evidence", () => {
  const created = createClientFixtureSession();
  const unavailable = submitClientFixtureQuestion(created.session.id, {
    ...identity,
    requestId: "10000000-0000-4000-8000-000000000003",
    agentId: agenttalkieUnavailableTarget.agentId,
    workerSessionId: agenttalkieUnavailableTarget.workerSessionId,
  });
  assert.equal(unavailable.session.requests[0]?.state, "unavailable");
  assert.equal(unavailable.session.requests[0]?.result, null);
  assert.equal(unavailable.session.requests[0]?.error?.code, "WORKER_UNAVAILABLE");
  assert.equal(unavailable.currentResult, null);
});
