import assert from "node:assert/strict";
import {randomUUID,createHmac} from "node:crypto";
import {POST} from "../src/app/api/agenttalkie/runner/route";
import {restore,load,sql,liveTarget,mutate} from "../src/lib/server/agenttalkie-live-store";
import {admit} from "../src/lib/server/agenttalkie-coordinator";

async function main(){
 process.env.AGENTTALKIE_DEMO_SECRET=randomUUID();
 const owner=`runner-check:${randomUUID()}`,runnerId=randomUUID();
 const token=createHmac("sha256",process.env.AGENTTALKIE_DEMO_SECRET).update("agenttalkie-runner-v1").digest("hex");
 const call=(body:object,authorized=true)=>POST(new Request("https://agenttalkie.app/api/agenttalkie/runner",{method:"POST",headers:{authorization:`Bearer ${authorized?token:"wrong"}`,"content-type":"application/json"},body:JSON.stringify({runnerId,...body})}));
 try{
  assert.equal((await call({operation:"claim"},false)).status,401);
  const session=await restore(owner);
  const request={requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question:"Inspect this public repository"};
  await admit(owner,session.session.id,request);
  const id=randomUUID();
  await sql()`INSERT INTO agenttalkie_jobs(id,owner,thread_id,request,kind,state) VALUES(${id},${owner},${session.session.id},${JSON.stringify(request)}::jsonb,'investigate','queued')`;
  const claims=await Promise.all([call({operation:"claim"}),call({operation:"claim"})]);
  const bodies=await Promise.all(claims.map(r=>r.json()));
  const claimed=bodies.filter(b=>b.job?.id===id);
  assert.equal(claimed.length,1,"Only one concurrent claim can launch the job");
  const result={operation:"result",jobId:id,claimId:claimed[0].job.claimId,status:"completed",answer:"Test harness receipt, not an actual external worker run.",harness:"codex",nativeSessionId:"test-session",repositoryRevision:"a".repeat(40),model:"test-model"};
  assert.equal((await call({...result,claimId:randomUUID()})).status,409);
  assert.equal((await call({...result,harness:"claude"})).status,409);
  assert.equal((await call(result)).status,200);
  assert.equal((await call(result)).status,200);
  assert.equal((await call({...result,status:"failed"})).status,409);
  assert.equal((await load(owner,session.session.id)).session.requests[0].state,"completed");
  assert.equal((await sql()`SELECT id FROM agenttalkie_events WHERE owner=${owner} AND details->>'kind'='source_returned'`).length,1);
  await mutate(owner,session.session.id,s=>{s.requests=[];s.activeRequestId=null;s.activeRevision=null;s.status="ended";});
  assert.equal((await call(result)).status,200);
  assert.equal((await load(owner,session.session.id)).session.requests.length,0);
  console.log("PASS: runner authentication, single claim, harness binding, result replay, one terminal event, and cleared history remain correct.");
 }finally{
  await sql()`DELETE FROM agenttalkie_jobs WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_events WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
  await sql()`DELETE FROM agenttalkie_runners WHERE id=${runnerId}`;
 }
}
main().catch(error=>{console.error(error.name,error.message);process.exitCode=1;});
