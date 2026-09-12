import assert from "node:assert/strict";
import test from "node:test";
import { agenttalkieFixture, agenttalkieFixtureRequest, agenttalkieFixtureTarget, agenttalkieUnavailableTarget } from "../lib/agenttalkie-fixture";
import { currentAnswer, isCurrentFollowup, safeSourceUrl } from "../lib/client/agenttalkie-state";

test("only an active, completed answer for the selected worker session is current", () => {
  assert.equal(currentAnswer(agenttalkieFixture, agenttalkieFixtureTarget, null), agenttalkieFixture.currentResult);
  assert.equal(currentAnswer(agenttalkieFixture, agenttalkieUnavailableTarget, null), null);
  const pending = structuredClone(agenttalkieFixture);
  pending.session.requests[0].state = "pending";
  assert.equal(currentAnswer(pending, agenttalkieFixtureTarget, null), null);
});

test("a correction hides the earlier answer before backend acknowledgement", () => {
  const correction = { ...agenttalkieFixtureRequest, revision: 2, question: "Only the voice blocker." };
  assert.equal(currentAnswer(agenttalkieFixture, agenttalkieFixtureTarget, correction), null);
  assert.equal(agenttalkieFixture.session.requests[0].result?.answer, agenttalkieFixture.currentResult?.answer);
});

test("a delayed old result cannot become current even if a response names it currentResult", () => {
  const snapshot = structuredClone(agenttalkieFixture);
  snapshot.session.activeRevision = 2;
  snapshot.session.requests[0].state = "superseded";
  assert.equal(currentAnswer(snapshot, agenttalkieFixtureTarget, null), null);
  assert.equal(snapshot.session.requests[0].result?.revision, 1);
});

test("a new request with the same revision does not reuse the previous answer", () => {
  const request = { ...agenttalkieFixtureRequest, requestId: "00000000-0000-4000-8000-000000000003" };
  assert.equal(currentAnswer(agenttalkieFixture, agenttalkieFixtureTarget, request), null);
});

test("same agent in a different existing session is not interchangeable", () => {
  assert.equal(currentAnswer(agenttalkieFixture, { ...agenttalkieFixtureTarget, workerSessionId: "another-session" }, null), null);
});

test("prepared follow-up is hidden as soon as its question is corrected", () => {
  const snapshot = structuredClone(agenttalkieFixture);
  snapshot.session.preparedFollowup = { ...agenttalkieFixtureRequest, recipient: "Demo worker", scope: "Review the voice blocker", status: "prepared", preparedAt: "2026-09-12T19:01:00Z" };
  assert.equal(isCurrentFollowup(snapshot, null), true);
  assert.equal(isCurrentFollowup(snapshot, { ...agenttalkieFixtureRequest, revision: 2 }), false);
  snapshot.session.activeRevision = 2;
  assert.equal(isCurrentFollowup(snapshot, null), false);
});

test("only web source references become clickable links", () => {
  assert.equal(safeSourceUrl("https://example.com/source"), "https://example.com/source");
  for (const source of ["fixture:checkpoint", "javascript:alert(1)", "data:text/html,<script/>", "file:///etc/passwd", "not a URL"]) assert.equal(safeSourceUrl(source), null);
});
