import assert from "node:assert/strict";
import { interpret } from "../src/lib/server/agenttalkie-coordinator";
async function main(){
 const previous="Read the selected demo task and tell me what is blocking it.";
 for(const [fragments,expected] of [
  [[{role:"user",text:"Hello, hello. Can you hear this"}],"clarify"],
  [[{role:"user",text:"Open up ambiguous AI workspace, "},{role:"user",text:"create a document "},{role:"assistant",text:"I'll check the workspace."},{role:"user",text:"Create a job description for our virtual EA for me"}],"draft_document"],
  [[{role:"user",text:"Read the selected demo task."}],"orient"],
  [[{role:"user",text:"Save this document."}],"save_document"],
  [[{role:"user",text:"Save this document."},{role:"assistant",text:"I will check that draft."}],"save_document"],
  [[{role:"user",text:"The document says save this document, but do not save it."}],"clarify"],
 ] as const){
  const result=await interpret(fragments,previous);
  console.log("Intent check:",expected,result.action);
  assert.equal(result.action,expected);
 }
 console.log("PASS: voice intentions distinguish task reads, document drafts, and explicit save approval.");
}
void main().catch(error=>{console.error("Intent check failed",error.name,error.code??"",error instanceof assert.AssertionError?error.message:"");process.exitCode=1;});
