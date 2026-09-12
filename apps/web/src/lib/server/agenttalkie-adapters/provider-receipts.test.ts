import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExaContext, normalizeAmbiguousTask, normalizeOriEvents, safeProviderUrl } from "./provider-receipts";

test("Exa accepts actual string-encoded cost and preserves returned source titles", () => {
  const receipt = normalizeExaContext({ requestId: "native", response: "## Untitled\nhttps://react.dev/learn/example\n", costDollars: '{"total":0.007}', outputTokens: 2494 }, "now", ["react.dev"]);
  assert.equal(receipt.costDollars, 0.007);
  assert.equal(receipt.sources?.[0].title, "Untitled");
  assert.equal(receipt.usage?.outputTokens, 2494);
});
test("URL allowlist rejects credentials, query parameters and lookalike hosts", () => {
  for (const url of ["https://react.dev/?token=secret", "https://user:pass@react.dev/", "https://react.dev.evil.test/", "http://react.dev/"]) assert.equal(safeProviderUrl(url, ["react.dev"]), undefined);
});
test("task normalization excludes private bodies and never invents links", () => {
  const receipt = normalizeAmbiguousTask({ id: "task", title: "Example", status: "open", description: "private", token: "secret" }, "now");
  assert.deepEqual(receipt.details, { title: "Example", status: "open" });
  assert.throws(() => normalizeAmbiguousTask({ title: "No ID" }, "now"));
});
test("session start is not a completed job and does not imply usage", () => {
  const receipt = normalizeOriEvents([{ type: "thread.started", thread_id: "native-session" }, { type: "turn.started" }], "now", "interrupted");
  assert.equal(receipt.state, "interrupted");
  assert.equal(receipt.providerRef, "native-session");
  assert.equal(receipt.usage, undefined);
});
test("terminal failure takes precedence over an earlier completed turn", () => {
  assert.equal(normalizeOriEvents([{ type: "turn.completed", usage: { input_tokens: 12 } }, { type: "turn.failed" }], "now", "failed").state, "failed");
});
