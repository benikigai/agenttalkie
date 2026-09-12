import { z } from "zod";
import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { restore, load, snapshot, mutate } from "@/lib/server/agenttalkie-live-store";
import { apiFailure, jsonReply, readJson } from "@/lib/server/agenttalkie-http";
export async function GET(request: Request) { try { const owner=liveOwner(request); const id=new URL(request.url).searchParams.get("sessionId"); return jsonReply(id ? snapshot((await load(owner,z.uuid().parse(id))).session) : await restore(owner)); } catch(error) { return apiFailure(error); } }
export async function POST(request: Request) {
 try { const owner=liveOwner(request); const {sessionId}=z.object({sessionId:z.uuid()}).strict().parse(await readJson(request)); return jsonReply(await mutate(owner,sessionId,s=>{s.status="ended";s.preparedFollowup=null; for(const r of s.requests) if(r.state==="pending") r.state="superseded";})); } catch(error){return apiFailure(error);}
}
