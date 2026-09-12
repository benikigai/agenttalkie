import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { restore, load, mutate, sql, liveTarget } from "../src/lib/server/agenttalkie-live-store";
import { admit } from "../src/lib/server/agenttalkie-coordinator";

// This exercises the configured database with a disposable owner and no provider calls.
async function main() {
  const owner = `storage-check:${randomUUID()}`;
  try {
    const sessions = await Promise.all(Array.from({length: 4}, () => restore(owner)));
    assert.equal(new Set(sessions.map(s => s.session.id)).size, 1);
    const id = sessions[0].session.id;
    const request = {requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question:"Storage verification only"};
    const admissions = await Promise.all([admit(owner,id,request),admit(owner,id,request)]);
    assert.equal(admissions.filter(r=>r.admitted).length,1);
    await assert.rejects(load(`other:${owner}`,id));
    const revised = {...request,revision:2,question:"Corrected storage verification"};
    await admit(owner,id,revised);
    await mutate(owner,id,s=>{
      const old=s.requests.find(r=>r.revision===1)!;
      const {question: _question,...identity}=request;
      old.result={...identity,answer:"Late obsolete result",evidence:[{kind:"source_read",reference:"Storage test",sourceObservedAt:null,retrievedAt:new Date().toISOString()}]};
    });
    const restored=await restore(owner);
    assert.equal(restored.session.activeRevision,2);
    assert.equal(restored.currentResult,null);
    assert.equal(restored.session.requests[0].state,"superseded");
    assert.equal(restored.session.requests[0].result?.answer,"Late obsolete result");
    await mutate(owner,id,s=>{s.status="ended";});
    assert.notEqual((await restore(owner)).session.id,id);
    console.log("PASS: concurrent restore, duplicate admission, ownership, correction, late result suppression, resume and new thread.");
  } finally {
    await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
  }
}
void main().catch((error)=>{console.error("Live storage verification failed.", error.name, error.code ?? "", error instanceof assert.AssertionError ? error.message : "", error.issues?.map((i:{path:unknown;message:string})=>({path:i.path,message:i.message})));process.exitCode=1;});
