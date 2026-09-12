import { after } from "next/server";
import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { apiFailure,jsonReply,readJson } from "@/lib/server/agenttalkie-http";
import { SubmitRequestSchema } from "@/lib/agenttalkie-contract";
import { admit,complete } from "@/lib/server/agenttalkie-coordinator";
export const maxDuration=120;
export async function POST(request:Request){try{const owner=liveOwner(request);const {sessionId,...input}=SubmitRequestSchema.parse(await readJson(request));const result=await admit(owner,sessionId,input);if(result.admitted)after(()=>complete(owner,sessionId,result.request));return jsonReply(result.snapshot,202);}catch(error){return apiFailure(error);}}
