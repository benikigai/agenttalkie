import assert from "node:assert/strict";
import {randomUUID,createHmac} from "node:crypto";
import {GET as terminalGET} from "../src/app/api/agenttalkie/live/terminal/route";
import {POST} from "../src/app/api/agenttalkie/runner/route";
import {restore,load,sql,liveTarget,mutate,expireRunnerJobs} from "../src/lib/server/agenttalkie-live-store";
import {admit} from "../src/lib/server/agenttalkie-coordinator";

async function main(){
 process.env.AGENTTALKIE_DEMO_SECRET=randomUUID();
 const owner=`runner-check:${randomUUID()}`,runnerId=randomUUID();
 const token=createHmac("sha256",process.env.AGENTTALKIE_DEMO_SECRET).update("agenttalkie-runner-v1").digest("hex");
 const call=(body:object,authorized=true)=>POST(new Request("https://agenttalkie.app/api/agenttalkie/runner",{method:"POST",headers:{authorization:`Bearer ${authorized?token:"wrong"}`,"content-type":"application/json"},body:JSON.stringify({runnerId,...((body as {operation?:string}).operation==="claim"?{outputVersion:1}:{}),...body})}));
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
  const output={operation:"output",jobId:id,claimId:claimed[0].job.claimId,entries:[{sequence:1,text:"$ ori codex"},{sequence:2,text:"Bearer secretvalue123 sk-testsecret123 op://Private/credential/password"}]};
  assert.equal((await call({...output,claimId:randomUUID()})).status,409);
  assert.equal((await call(output)).status,200);
  assert.equal((await call(output)).status,200);
  const url=`https://agenttalkie.app/api/agenttalkie/live/terminal?sessionId=${session.session.id}&requestId=${request.requestId}&revision=1`;
  const cookieFor=(who:string)=>{const payload=Buffer.from(JSON.stringify({owner:who,expires:Date.now()+60000})).toString("base64url");return `agenttalkie-live=${payload}.${createHmac("sha256",process.env.AGENTTALKIE_DEMO_SECRET!).update(payload).digest("hex")}`;};
  assert.equal((await terminalGET(new Request(url))).status,401);
  assert.equal((await terminalGET(new Request(url,{headers:{cookie:cookieFor("other-owner")}}))).status,404);
  const terminal=await terminalGET(new Request(url,{headers:{cookie:cookieFor(owner)}}));
  assert.equal(terminal.status,200);
  const streamed=await terminal.json();assert.equal(streamed.entries.length,2);assert.ok(!streamed.entries[1].text.includes("secretvalue123"));assert.ok(!streamed.entries[1].text.includes("op://"));
  const result={operation:"result",jobId:id,claimId:claimed[0].job.claimId,status:"completed",answer:"Test harness receipt, not an actual external worker run.",harness:"codex",nativeSessionId:"test-session",repositoryRevision:"a".repeat(40),model:"test-model"};
  assert.equal((await call({...result,claimId:randomUUID()})).status,409);
  assert.equal((await call({...result,harness:"claude"})).status,409);
  assert.equal((await call(result)).status,200);
  assert.equal((await call(output)).status,409);
  assert.equal((await call(result)).status,200);
  assert.equal((await call({...result,status:"failed"})).status,409);
  assert.equal((await load(owner,session.session.id)).session.requests[0].state,"completed");
  assert.equal((await sql()`SELECT id FROM agenttalkie_events WHERE owner=${owner} AND details->>'kind'='source_returned'`).length,1);
  const timedOut={...request,requestId:randomUUID()};
  await admit(owner,session.session.id,timedOut);
  await sql()`INSERT INTO agenttalkie_jobs(id,owner,thread_id,request,kind,state,created_at) VALUES(${randomUUID()},${owner},${session.session.id},${JSON.stringify(timedOut)}::jsonb,'investigate','queued',now()-interval '5 minutes')`;
  await expireRunnerJobs(owner,session.session.id);
  assert.equal((await load(owner,session.session.id)).session.requests.find(r=>r.requestId===timedOut.requestId)?.error?.code,"RUNNER_RESULT_UNKNOWN");
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
