import { z } from "zod";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { load,sql,liveTarget,snapshot } from "@/lib/server/agenttalkie-live-store";
import { interpret,admit,complete } from "@/lib/server/agenttalkie-coordinator";
import { apiFailure,jsonReply,readJson } from "@/lib/server/agenttalkie-http";
export const maxDuration=120;
const input=z.object({sessionId:z.uuid(),delegationId:z.string().min(1).max(200),transcript:z.array(z.object({role:z.enum(["user","assistant"]),text:z.string().max(4000)})).min(1).max(60)}).strict();
export async function POST(request:Request){try{
 const owner=liveOwner(request);const data=input.parse(await readJson(request,50000));const {session}=await load(owner,data.sessionId);
 const id=data.sessionId+":"+data.delegationId; const requestId=randomUUID();
 const claim=await sql()`INSERT INTO agenttalkie_delegations(id,owner,thread_id,request_id) VALUES(${id},${owner},${data.sessionId},${requestId}) ON CONFLICT DO NOTHING RETURNING id`;
 if(!claim.length){
  const rows=await sql()`SELECT result FROM agenttalkie_delegations WHERE id=${id} AND owner=${owner}`;
  if(rows[0]?.result){
    const stored=rows[0].result;
    const latest=(await load(owner,data.sessionId)).session;
    if(stored.status==="accepted"){
      if(latest.status!=="active"||latest.activeRequestId!==stored.request.requestId||latest.activeRevision!==stored.request.revision)
        return jsonReply({status:"clarify",message:"That voice request has been superseded. Continue with the current request shown in the workspace."});
      return jsonReply({...stored,snapshot:snapshot(latest)});
    }
    return jsonReply(stored);
  }
  return jsonReply({status:"clarify",message:"That voice request was already received, but its outcome is not confirmed. Check Activity before asking again."});
 }
 const reply=async(body:unknown)=>{await sql()`UPDATE agenttalkie_delegations SET result=${JSON.stringify(body)}::jsonb WHERE id=${id} AND owner=${owner}`;return jsonReply(body);};
 const previous=session.requests.find(r=>r.requestId===session.activeRequestId&&r.revision===session.activeRevision);
 const intent=await interpret(data.transcript,previous?.question??null);
 if(intent.action==="clarify")return reply({status:"clarify",message:intent.question});
 const result=await admit(owner,data.sessionId,{requestId:intent.correction&&previous?previous.requestId:requestId,revision:intent.correction&&previous?previous.revision+1:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question:intent.question});
 if(result.admitted)after(()=>complete(owner,data.sessionId,result.request,intent));
 return reply({status:"accepted",snapshot:result.snapshot,request:result.request});
 }catch(error){return apiFailure(error);}}
