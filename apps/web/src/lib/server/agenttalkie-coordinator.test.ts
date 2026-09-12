import assert from "node:assert/strict";
import test from "node:test";
import { interpret } from "./agenttalkie-coordinator";

test("explicit coding harness survives an incorrect model classification", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({action:"review",question:"Inspect the repository file",correction:false})}]}]}));
  const result = await interpret([{role:"user",text:"Have Codex inspect apps/web/src/lib/server/agenttalkie-documents.ts and explain duplicate-save protection."}], null);
  assert.equal(result.action, "investigate");
  const review = await interpret([{role:"user",text:"Have Claude Code independently review this exact Codex artifact."}], null);
  assert.equal(review.action, "review");
});
