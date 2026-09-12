import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiFailure, jsonReply, readJson } from "@/lib/server/agenttalkie-http";
import { AgentTalkieError } from "@/lib/server/agenttalkie-service";
import { sql, mutate, recordEvent } from "@/lib/server/agenttalkie-live-store";
import { WorkerRequestSchema } from "@/lib/agenttalkie-contract";

const command=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("claim"),runnerId:z.uuid()}).strict(),
 z.object({operation:z.literal("heartbeat"),runnerId:z.uuid()}).strict(),
 z.object({operation:z.literal("result"),runnerId:z.uuid(),jobId:z.string().max(100),claimId:z.uuid(),
  status:z.enum(["completed","failed"]),answer:z.string().min(1).max(11000),harness:z.enum(["codex","claude"]),
  nativeSessionId:z.string().max(200).nullable(),repositoryRevision:z.string().regex(/^[a-f0-9]{40}$/),model:z.string().max(200),
 }).strict(),
]);
function authorize(request:Request){
 const secret=process.env.AGENTTALKIE_DEMO_SECRET;
 if(!secret)throw new AgentTalkieError(503,"RUNNER_UNCONFIGURED","Runner authentication is unavailable.");
 const expected=createHmac("sha256",secret).update("agenttalkie-runner-v1").digest();
 const supplied=Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /,"")??"","hex");
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new AgentTalkieError(401,"RUNNER_UNAUTHORIZED","Runner authentication required.");
}
export async function POST(request:Request){try{
 authorize(request);
 const input=command.parse(await readJson(request,30000));
 await sql()`INSERT INTO agenttalkie_runners(id,heartbeat) VALUES(${input.runnerId},now()) ON CONFLICT(id) DO UPDATE SET heartbeat=now()`;
 if(input.operation==="heartbeat")return jsonReply({ok:true});
 if(input.operation==="claim"){
  const claimId=randomUUID();
  const rows=await sql()`UPDATE agenttalkie_jobs j SET state='claimed',runner_id=${input.runnerId},claim_id=${claimId},claimed_at=now()
   FROM (SELECT job.id FROM agenttalkie_jobs job JOIN agenttalkie_threads t ON t.id=job.thread_id AND t.owner=job.owner
    WHERE job.state='queued' AND t.data->>'status'='active' AND t.data->>'activeRequestId'=job.request->>'requestId'
    AND (t.data->>'activeRevision')::integer=(job.request->>'revision')::integer
    ORDER BY job.created_at FOR UPDATE OF job SKIP LOCKED LIMIT 1) candidate WHERE j.id=candidate.id RETURNING j.*`;
  const job=rows[0];
  if(!job)return jsonReply({job:null});
  await recordEvent(job.owner,job.thread_id,WorkerRequestSchema.parse(job.request),"ori",job.kind==="review"?"Claude Code job started":"Codex job started","running",{providerRef:job.id,kind:"worker_start",harness:job.kind==="review"?"claude":"codex"});
  return jsonReply({job:{id:job.id,claimId,kind:job.kind,request:job.request,context:job.context}});
 }
 const rows=await sql()`SELECT * FROM agenttalkie_jobs WHERE id=${input.jobId} AND runner_id=${input.runnerId} AND claim_id=${input.claimId}`;
 const job=rows[0];
 if(!job)throw new AgentTalkieError(409,"JOB_CLAIM_MISMATCH","The runner does not own this job.");
 const expectedHarness=job.kind==="review"?"claude":"codex";
 if(input.harness!==expectedHarness)throw new AgentTalkieError(409,"HARNESS_MISMATCH","The result used a different coding harness.");
 const artifactHash=createHash("sha256").update(input.answer).digest("hex");
 if(job.state!=="claimed"){
  if(job.result?.artifactHash!==artifactHash || job.result?.status!==input.status || job.result?.harness!==input.harness || job.result?.nativeSessionId!==input.nativeSessionId || job.result?.repositoryRevision!==input.repositoryRevision || job.result?.model!==input.model)throw new AgentTalkieError(409,"JOB_ALREADY_RETURNED","This job already has a different terminal result.");
 }
 const receipt=job.result??{...input,artifactHash,returnedAt:new Date().toISOString()};
 if(job.state==="claimed"){
 const claimed=await sql()`UPDATE agenttalkie_jobs SET state=${input.status},result=${JSON.stringify(receipt)}::jsonb WHERE id=${job.id} AND state='claimed' RETURNING id`;
 if(!claimed.length)throw new AgentTalkieError(409,"JOB_ALREADY_RETURNED","The terminal result was already received. Retry this same result.");
 }
 const workerRequest=WorkerRequestSchema.parse(job.request);
 await mutate(job.owner,job.thread_id,s=>{
  const r=s.requests.find(r=>r.requestId===workerRequest.requestId&&r.revision===workerRequest.revision);
  if(!r)return;
  if(input.status==="completed")r.result={requestId:r.requestId,revision:r.revision,projectId:r.projectId,agentId:r.agentId,workerSessionId:r.workerSessionId,
   answer:`${input.harness==="codex"?"Codex investigation":"Claude Code review"} returned from the real Ori runner. No code was deployed.\n\n${input.answer}`,
   evidence:[{kind:"worker_reply",reference:`Ori ${input.harness} job ${job.id}; session ${input.nativeSessionId??"not returned"}; artifact SHA256 ${artifactHash}; repository ${input.repositoryRevision}`,sourceObservedAt:receipt.returnedAt,retrievedAt:receipt.returnedAt}]};
  else r.error={code:"RUNNER_JOB_FAILED",message:input.answer};
  if(r.state!=="superseded"&&s.status==="active")r.state=input.status;
  r.updatedAt=receipt.returnedAt;
 });
 const digest=createHash("sha256").update(job.id+":terminal").digest("hex");
 const eventId=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
 await recordEvent(job.owner,job.thread_id,workerRequest,"ori",input.status==="completed"?`${input.harness} returned a verified process result`:`${input.harness} job failed`,input.status,{providerRef:input.nativeSessionId??job.id,harness:input.harness,artifactHash,repositoryRevision:input.repositoryRevision,requestedModel:input.model,kind:input.status==="completed"?"source_returned":"failure"},eventId);
 return jsonReply({ok:true,artifactHash});
}catch(error){return apiFailure(error);}}
