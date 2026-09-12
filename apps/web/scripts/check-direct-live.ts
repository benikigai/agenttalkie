import { runDirectTools } from "../src/lib/server/agenttalkie-direct-tools";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { restore, load, mutate, sql, liveTarget } from "../src/lib/server/agenttalkie-live-store";
import { admit, complete, modelJSON } from "../src/lib/server/agenttalkie-coordinator";
async function main(){
 const owner=`direct-live-${randomUUID()}`;const snapshot=await restore(owner);const sessionId=snapshot.session.id;
 async function run(question:string,action:"workspace_tool"|"approve_tool"){
  const request={requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question};
  await admit(owner,sessionId,request);
  if(action==="workspace_tool"){
   const result=await runDirectTools({owner,sessionId,request},question,modelJSON);
   await mutate(owner,sessionId,s=>{const r=s.requests.at(-1)!;const {question,...identity}=request;r.state="completed";r.result={...identity,...result};});
  }else await complete(owner,sessionId,request,{action,question,correction:false});
  const r=(await load(owner,sessionId)).session.requests.at(-1)!;
  assert.equal(r.state,"completed",r.error?.message);assert.ok(r.result);return r.result;
 }
 try{
  const read=await run("List my Ambiguous documents. Show their real titles and IDs.","workspace_tool");
  const events=await sql()`SELECT details FROM agenttalkie_events WHERE owner=${owner} AND details->>'tool'='list_documents' AND state='completed'`;
  assert.ok(events.length,"Expected actual list_documents tool result");
  console.log("PASS: live model selected list_documents and returned real workspace records.");
  if(process.argv.includes('--write-demo-task')){
   const title="AgentTalkie direct-tools live verification";
   const preview=await run(`Create an unassigned task titled ${title}. Description: Verify direct MCP tool calls and provider readback in AgentTalkie. Do not set a due date, subscriber, assignee or priority.`,"workspace_tool");
   assert.ok(preview.evidence.some(e=>e.kind==="checkpoint"&&e.reference.startsWith("AgentTalkie workspace action ")));
   const action=await sql()`SELECT tool_name,arguments FROM agenttalkie_tool_actions WHERE owner=${owner} AND state='prepared'`;
   assert.equal(action[0].tool_name,"create_task");assert.equal(action[0].arguments.title,title);
   assert.ok(!action[0].arguments.assignee_id&&!action[0].arguments.subscriber_ids);
   const saved=await run("approve workspace action","approve_tool");
   const receipt=await sql()`SELECT details FROM agenttalkie_events WHERE owner=${owner} AND details->>'kind'='readback'`;
   assert.ok(receipt.length);console.log(JSON.stringify({status:"created and read back",title,id:receipt[0].details.providerRef}));
   assert.match(saved.answer,/read back/);
  }
 }finally{
  await sql()`DELETE FROM agenttalkie_tool_actions WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_events WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
 }
}
main().catch(e=>{console.error(e instanceof Error?e.stack:"Verification failed");process.exitCode=1;});
