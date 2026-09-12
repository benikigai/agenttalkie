import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../src/app/api/agenttalkie/live/delegation/route";
import { issueCookie,liveOwner } from "../src/lib/server/agenttalkie-live-auth";
import { restore,liveTarget,sql } from "../src/lib/server/agenttalkie-live-store";
import { admit } from "../src/lib/server/agenttalkie-coordinator";

async function main(){
 process.env.AGENTTALKIE_DEMO_SECRET=randomUUID()+randomUUID();
 const cookie=issueCookie().split(";")[0];
 const owner=liveOwner(new Request("https://agenttalkie.app/api/agenttalkie/live/session",{headers:{cookie}}));
 try{
  const {session}=await restore(owner);
  const request={requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question:"Replay verification"};
  const accepted=await admit(owner,session.id,request);
  const saved={status:"accepted",snapshot:accepted.snapshot,request};
  const delegationId="offline-replay-check";
  const id=session.id+":"+delegationId;
  await sql()`INSERT INTO agenttalkie_delegations(id,owner,thread_id,request_id,result) VALUES(${id},${owner},${session.id},${request.requestId},${JSON.stringify(saved)}::jsonb)`;
  const replay=()=>POST(new Request("https://agenttalkie.app/api/agenttalkie/live/delegation",{method:"POST",headers:{cookie,origin:"https://agenttalkie.app","content-type":"application/json"},body:JSON.stringify({sessionId:session.id,delegationId,transcript:[{role:"user",text:"Replay verification"}]})}));
  assert.equal((await (await replay()).json()).status,"accepted");
  await admit(owner,session.id,{...request,revision:2,question:"Corrected verification"});
  const stale=await (await replay()).json();
  assert.equal(stale.status,"clarify");
  assert.match(stale.message,/superseded/);
  console.log("PASS: delegation replay restores current state and refuses superseded instructions without provider calls.");
 }finally{
  await sql()`DELETE FROM agenttalkie_delegations WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
 }
}
void main().catch(error=>{console.error("Delegation replay verification failed",error.name,error.code??"",error instanceof assert.AssertionError?error.message:"");process.exitCode=1;});
