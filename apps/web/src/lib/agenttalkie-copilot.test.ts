import assert from "node:assert/strict";
import test from "node:test";
import { agenttalkieFixture } from "./agenttalkie-fixture";
import { findAllowedTarget, isCurrentResultIdentity } from "./agenttalkie-copilot";

test("Copilot target selection accepts only an exact allowed identity", () => {
  const allowed = agenttalkieFixture.targets[0];
  assert.equal(findAllowedTarget(agenttalkieFixture.targets, allowed), allowed);
  assert.equal(findAllowedTarget(agenttalkieFixture.targets, { ...allowed, workerSessionId: "unknown-session" }), null);
});

test("Copilot follow-up preparation requires the exact current result revision", () => {
  const result = agenttalkieFixture.currentResult;
  assert.ok(result);
  assert.equal(isCurrentResultIdentity(result, result), true);
  assert.equal(isCurrentResultIdentity(result, { requestId: result.requestId, revision: result.revision + 1 }), false);
  assert.equal(isCurrentResultIdentity(null, result), false);
});
