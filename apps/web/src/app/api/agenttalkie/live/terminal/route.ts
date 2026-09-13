import {z} from "zod";
import {liveOwner} from "@/lib/server/agenttalkie-live-auth";
import {load,sql} from "@/lib/server/agenttalkie-live-store";
import {apiFailure,jsonReply} from "@/lib/server/agenttalkie-http";

export async function GET(request:Request){try{
 const owner=liveOwner(request),params=new URL(request.url).searchParams;
 const sessionId=z.uuid().parse(params.get("sessionId"));
 const requestId=z.uuid().parse(params.get("requestId"));
 const revision=z.coerce.number().int().positive().parse(params.get("revision"));
 const {session}=await load(owner,sessionId);
 if(!session.requests.some(r=>r.requestId===requestId&&r.revision===revision))return jsonReply({job:null,entries:[]});
 const rows=await sql()`SELECT id,kind,state,result FROM agenttalkie_jobs WHERE owner=${owner} AND thread_id=${sessionId} AND request->>'requestId'=${requestId} AND (request->>'revision')::integer=${revision} LIMIT 1`;
 const job=rows[0];if(!job)return jsonReply({job:null,entries:[]});
 const entries=await sql()`SELECT sequence,text,observed_at FROM agenttalkie_job_output WHERE job_id=${job.id} ORDER BY sequence LIMIT 200`;
 return jsonReply({job:{id:job.id,harness:['review','edit'].includes(job.kind)?'claude':'codex',state:job.state,nativeSessionId:job.result?.nativeSessionId??null},entries:entries.map(e=>({sequence:e.sequence,text:e.text,observedAt:new Date(e.observed_at).toISOString()}))});
}catch(error){return apiFailure(error);}}
