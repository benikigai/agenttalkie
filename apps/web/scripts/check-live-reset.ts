import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../src/app/api/agenttalkie/live/session/route";
import { issueCookie, liveOwner } from "../src/lib/server/agenttalkie-live-auth";
import { restore, load, mutate, liveTarget, sql } from "../src/lib/server/agenttalkie-live-store";
import { admit } from "../src/lib/server/agenttalkie-coordinator";

async function main() {
  process.env.AGENTTALKIE_DEMO_SECRET=randomUUID()+randomUUID();
  const cookie=issueCookie().split(";")[0];
  const owner=liveOwner(new Request("https://agenttalkie.app/api/agenttalkie/live/session",{headers:{cookie}}));
  const reset=async(sessionId:string,operation:"new"|"clear")=>{
    const response=await POST(new Request("https://agenttalkie.app/api/agenttalkie/live/session",{method:"POST",headers:{cookie,origin:"https://agenttalkie.app","content-type":"application/json"},body:JSON.stringify({sessionId,operation})}));
    assert.equal(response.status,200);
    return response.json();
  };
  const add=async(sessionId:string)=>{
    const request={requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question:"Reset verification"};
    await admit(owner,sessionId,request);
    return request;
  };
  try {
    const original=await restore(owner);
    await add(original.session.id);
    const fresh=await reset(original.session.id,"new");
    assert.notEqual(fresh.session.id,original.session.id);
    assert.equal(fresh.session.activeRequestId,null);
    assert.equal(fresh.session.requests.length,0);
    const archived=(await load(owner,original.session.id)).session;
    assert.equal(archived.status,"ended");
    assert.equal(archived.requests[0].state,"superseded");
    assert.equal((await reset(original.session.id,"new")).session.id,fresh.session.id);
    const pending=await add(fresh.session.id);
    const cleared=await reset(fresh.session.id,"clear");
    assert.notEqual(cleared.session.id,fresh.session.id);
    assert.equal((await load(owner,fresh.session.id)).session.requests.length,0);
    await mutate(owner,fresh.session.id,s=>{const late=s.requests.find(r=>r.requestId===pending.requestId);if(late)late.error={code:"LATE",message:"Must not reappear"};});
    assert.equal((await load(owner,fresh.session.id)).session.requests.length,0);
    assert.equal((await load(owner,cleared.session.id)).session.requests.length,0);
    console.log("PASS: new conversation clears active work, replay keeps one new thread, and cleared history cannot return from a late result.");
  } finally {
    await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
  }
}
void main().catch(error=>{console.error("Reset verification failed",error.name,error.code??"",error instanceof assert.AssertionError?error.message:"");process.exitCode=1;});
