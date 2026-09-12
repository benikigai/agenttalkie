import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admit,complete,interpret } from "../src/lib/server/agenttalkie-coordinator";
import { restore,load,liveTarget,sql } from "../src/lib/server/agenttalkie-live-store";
async function main(){
 const owner=`provider-check:${randomUUID()}`;
 try{
  const {session}=await restore(owner);
  for(const question of ["List my actual Ambiguous workspace tasks.","Read the selected demo task and tell me what is blocking it.","Find public code examples for preserving a selected task during a browser WebRTC reconnect."]){
   const intent=await interpret([{role:"user",text:question}],null);
   console.log("Interpreter action:",intent.action, intent.action === "clarify" ? intent.question : "");
   const request={requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question};
   await admit(owner,session.id,request);
   await complete(owner,session.id,request,intent);
   const current=(await load(owner,session.id)).session.requests.find(r=>r.requestId===request.requestId)!;
   console.log("Provider outcome:",current.state,current.error?.code??"", "answer characters",current.result?.answer.length??0,"evidence count",current.result?.evidence.length??0);
   assert.equal(current.state,"completed");
  }
 }finally{
  await sql()`DELETE FROM agenttalkie_workspace_context WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_events WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
 }
}
void main().catch(error=>{console.error("Provider check failed:",error.name,error.code??"",error instanceof assert.AssertionError?error.message:"");process.exitCode=1;});
