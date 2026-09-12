import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AmbiguousDocuments, prepareDocument, saveDocument } from "../src/lib/server/agenttalkie-documents";
import { admit } from "../src/lib/server/agenttalkie-coordinator";
import { restore, mutate, liveTarget, sql } from "../src/lib/server/agenttalkie-live-store";

// Real durable-store concurrency checks. Provider writes are deliberately mocked.
async function main() {
  const owner = `document-check:${randomUUID()}`;
  const { session } = await restore(owner);
  let creates = 0;
  const provider = new AmbiguousDocuments("test-key", async () => { throw new Error("Unexpected HTTP call"); });
  provider.create = async () => { creates++; return randomUUID(); };
  provider.verify = async (id, draft) => ({ providerRef: id, title: draft.title, verifiedAt: new Date().toISOString() });
  const request = (question: string) => ({ requestId: randomUUID(), revision: 1, projectId: liveTarget.projectId, agentId: liveTarget.agentId, workerSessionId: liveTarget.workerSessionId, question });
  const draft = async () => {
    const r = request("Draft a virtual EA job description");
    await admit(owner, session.id, r);
    const prepared = await prepareDocument(owner, session.id, r, { title: "Virtual EA", content: "Calendar and inbox support." });
    await mutate(owner, session.id, s => {
      const record = s.requests.find(x => x.requestId === r.requestId)!;
      record.state = "completed";
      record.result = { ...r, answer: prepared.draft.content, evidence: [{ kind: "checkpoint", reference: `AgentTalkie document draft ${prepared.id}`, sourceObservedAt: null, retrievedAt: new Date().toISOString() }] };
      // Worker results carry identity, not the original request question.
      delete (record.result as unknown as Record<string, unknown>).question;
    });
    return prepared;
  };
  try {
    const missing = request("save this document");
    await admit(owner, session.id, missing);
    await assert.rejects(saveDocument(owner, session.id, missing, provider));
    assert.equal(creates, 0);

    await draft();
    const save = request("save this document");
    await admit(owner, session.id, save);
    const race = await Promise.allSettled([saveDocument(owner, session.id, save, provider), saveDocument(owner, session.id, save, provider)]);
    assert.ok(race.some(r => r.status === "fulfilled"));
    assert.equal(creates, 1, "Concurrent saves must create only one document");
    const replay = await saveDocument(owner, session.id, save, provider);
    assert.equal(replay.title, "Virtual EA");
    assert.equal(creates, 1);

    await draft();
    const staleSave = request("save this document");
    await admit(owner, session.id, staleSave);
    await admit(owner, session.id, request("Actually change the responsibilities first"));
    await assert.rejects(saveDocument(owner, session.id, staleSave, provider));
    assert.equal(creates, 1);

    await draft();
    const uncertain = request("save this document");
    await admit(owner, session.id, uncertain);
    provider.verify = async () => { throw new Error("Readback timed out"); };
    await assert.rejects(saveDocument(owner, session.id, uncertain, provider));
    await assert.rejects(saveDocument(owner, session.id, uncertain, provider));
    assert.equal(creates, 2, "An uncertain write must not be retried");
    const rows = await sql()`SELECT provider_ref,state FROM agenttalkie_documents WHERE owner=${owner} AND save_request=${uncertain.requestId + ":1"}`;
    assert.equal(rows[0].state, "unknown");
    assert.ok(rows[0].provider_ref, "Preserve a created ID even when readback fails");
    console.log("PASS: exact draft approval, concurrent save exclusion, receipt replay, stale rejection, and uncertain write protection (mock provider).");
  } finally {
    await sql()`DELETE FROM agenttalkie_documents WHERE owner=${owner}`;
    await sql()`DELETE FROM agenttalkie_events WHERE owner=${owner}`;
    await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
  }
}
void main().catch(error => { console.error("Document verification failed", error.name, error.code ?? "", error instanceof assert.AssertionError ? error.message : ""); process.exitCode = 1; });
