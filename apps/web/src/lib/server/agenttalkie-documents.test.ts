import assert from "node:assert/strict";
import test from "node:test";
import { AmbiguousDocuments, documentBody, documentHash } from "./agenttalkie-documents";

const id = "5914cb9b-8060-4d99-ad0f-78e2093e7a63";
const draft = { title: "Virtual EA", content: "Responsibilities\n\nCalendar and inbox support.\nConfirm unclear requests." };
const returned = { id, type: "doc", title: draft.title, content: documentBody(draft.content), visibility: "restricted", import_warnings: [] };

test("document writes use exact preview content, restricted visibility, and explicit readback", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const provider = new AmbiguousDocuments("test-key", async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json(calls.length === 1 ? { id } : returned);
  });
  const created = await provider.create(draft, "operation-1");
  assert.equal(created, id);
  assert.equal(calls.length, 1);
  const receipt = await provider.verify(created, draft);
  assert.equal(receipt.providerRef, id);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, `https://app.ambiguous.ai/api/documents/${id}`);
  const body = JSON.parse(calls[0].init!.body as string);
  assert.equal(body.visibility, "restricted");
  assert.equal(body.content, documentBody(draft.content));
  assert.deepEqual(body.labels, ["agenttalkie:operation-1"]);
});

test("readback rejects changed text, title, ID, visibility, and dropped content", async () => {
  for (const changed of [
    { content: documentBody("Wrong content") }, { title: "Wrong title" },
    { id: "1ceba9ba-dac1-4f3e-9590-41a14c07a2d5" }, { visibility: "public" },
    { import_warnings: ["Dropped content"] },
  ]) {
    const provider = new AmbiguousDocuments("test-key", async () => Response.json({ ...returned, ...changed }));
    await assert.rejects(provider.verify(id, draft));
  }
});

test("document authorization failures do not leak provider bodies or retry", async () => {
  let calls = 0;
  const provider = new AmbiguousDocuments("test-key", async () => { calls++; return new Response("private provider data", { status: 403 }); });
  await assert.rejects(provider.create(draft, "operation-1"), error => error instanceof Error && /403/.test(error.message) && !/private provider data/.test(error.message));
  assert.equal(calls, 1);
});

test("approval hash changes when the document title or content changes", () => {
  assert.notEqual(documentHash(draft), documentHash({ ...draft, title: "Different title" }));
  assert.notEqual(documentHash(draft), documentHash({ ...draft, content: draft.content + " extra" }));
});
