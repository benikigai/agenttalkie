import { z } from "zod";
import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { restore, load, snapshot, mutate, sql, expireRunnerJobs } from "@/lib/server/agenttalkie-live-store";
import { apiFailure, jsonReply, readJson } from "@/lib/server/agenttalkie-http";
export async function GET(request: Request) { try { const owner=liveOwner(request); const supplied=new URL(request.url).searchParams.get("sessionId"); const id=supplied?z.uuid().parse(supplied):(await restore(owner)).session.id; await expireRunnerJobs(owner,id); return jsonReply(snapshot((await load(owner,id)).session)); } catch(error) { return apiFailure(error); } }
export async function POST(request: Request) {
 try {
  const owner=liveOwner(request);
  const {sessionId,operation}=z.object({sessionId:z.uuid(),operation:z.enum(["end","new","clear"]).default("end")}).strict().parse(await readJson(request));
  const ended=await mutate(owner,sessionId,s=>{
   s.status="ended";s.preparedFollowup=null;
   for(const r of s.requests) if(r.state==="pending") r.state="superseded";
   if(operation==="clear"){s.requests=[];s.activeRequestId=null;s.activeRevision=null;}
  });
  if(operation==="clear"){
   await sql()`DELETE FROM agenttalkie_tool_actions WHERE owner=${owner} AND thread_id=${sessionId} AND state='prepared'`;
   await sql()`DELETE FROM agenttalkie_documents WHERE owner=${owner} AND thread_id=${sessionId} AND state='prepared'`;
   await sql()`DELETE FROM agenttalkie_workspace_context WHERE owner=${owner} AND thread_id=${sessionId}`;
  }
  return jsonReply(operation==="end"?ended:await restore(owner));
 } catch(error){return apiFailure(error);}
}
