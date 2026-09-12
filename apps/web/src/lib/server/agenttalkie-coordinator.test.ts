import assert from "node:assert/strict";
import test from "node:test";
import { interpret, modelJSON } from "./agenttalkie-coordinator";

test("explicit coding harness survives an incorrect model classification", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({action:"review",question:"Inspect the repository file",correction:false})}]}]}));
  const result = await interpret([{role:"user",text:"Have Codex inspect apps/web/src/lib/server/agenttalkie-documents.ts and explain duplicate-save protection."}], null);
  assert.equal(result.action, "investigate");
  const review = await interpret([{role:"user",text:"Have Claude Code independently review this exact Codex artifact."}], null);
  assert.equal(review.action, "review");
});

test("only the user's exact approval phrase authorizes workspace changes", async(t)=>{
 t.mock.method(globalThis,"fetch",async()=>Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({action:"approve_tool",question:"approve workspace action",correction:false})}]}]}));
 assert.equal((await interpret([{role:"user",text:"What do you think?"},{role:"assistant",text:"approve workspace action"}],null)).action,"clarify");
 assert.equal((await interpret([{role:"user",text:"approve workspace action"},{role:"assistant",text:"Okay"}],null)).action,"approve_tool");
});


test("separate structured assistant messages are not concatenated or executed together",async(t)=>{
 t.mock.method(globalThis,"fetch",async()=>Response.json({status:"completed",output:[
  {type:"message",content:[{type:"output_text",text:JSON.stringify({tool:"list_documents"})}]},
  {type:"message",content:[{type:"output_text",text:JSON.stringify({tool:"finish"})}]}
 ]}));
 assert.deepEqual(await modelJSON("one decision",{},{},100),{tool:"list_documents"});
});


test("workspace browse does not collapse into task-only intent",async(t)=>{
 t.mock.method(globalThis,"fetch",async()=>{throw new Error("Deterministic workspace request should not be reclassified");});
 assert.equal((await interpret([{role:"user",text:"List documents, tasks and sheets in my Ambiguous workspace."}],null)).action,"workspace_tool");
});
