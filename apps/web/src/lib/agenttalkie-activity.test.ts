import assert from "node:assert/strict";
import test from "node:test";
import { activityEventSchema, orderActivityEvents, type ActivityEvent } from "./agenttalkie-activity";
import { activityProofLedger } from "./server/agenttalkie-activity";

const base: ActivityEvent = {
  eventId: "event-1", operationId: "operation-1", requestId: "request-1", revision: 1,
  provider: "exa", kind: "source_returned", state: "completed", label: "Sources returned",
  observedAt: "2026-09-12T20:00:00.000Z", evidenceMode: "live", details: {},
};

test("activity events replay idempotently and sort by observed time", () => {
  const later = { ...base, eventId: "event-2", observedAt: "2026-09-12T21:00:00.000Z" };
  assert.deepEqual(orderActivityEvents([later, base, base]).map((event) => event.eventId), ["event-1", "event-2"]);
  assert.throws(() => orderActivityEvents([base, { ...base, label: "Changed" }]), /collision/);
});

test("activity URL fields reject credentials and non-HTTPS URLs", () => {
  assert.equal(activityEventSchema.safeParse({ ...base, safeUrl: "https://user:secret@example.com/task" }).success, false);
  assert.equal(activityEventSchema.safeParse({ ...base, sources: [{ title: "Source", safeUrl: "http://example.com" }] }).success, false);
  assert.equal(activityEventSchema.safeParse({ ...base, sources: [{ title: "Source", safeUrl: "https://react.dev.evil.test/" }] }).success, false);
});

test("provider proof preserves completed receipts and the interrupted Ori attempt", () => {
  const ledger = activityProofLedger();
  assert.equal(ledger.contractVersion, "AT-activity-0.1");
  assert.deepEqual(ledger.events.map((event) => [event.provider, event.state]), [
    ["exa", "completed"], ["ori", "interrupted"], ["ambiguous", "completed"],
  ]);
  assert.equal(ledger.events[0].providerRef, "26ff394d654cb8c6c8139d1748c007cb");
  assert.equal(ledger.events[0].details.costDollars, 0.007);
  assert.equal(ledger.events[2].providerRef, undefined);
  assert.equal(ledger.events[2].safeUrl, undefined);
  assert.deepEqual(ledger.events[2].details, {
    createCount: 1,
    readbackCount: 1,
    providerUrlReturned: false,
    historicalObservation: true,
  });
});
