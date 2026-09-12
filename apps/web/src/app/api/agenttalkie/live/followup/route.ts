import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { mutate,liveTarget } from "@/lib/server/agenttalkie-live-store";
import { apiFailure,jsonReply,readJson } from "@/lib/server/agenttalkie-http";
import { PrepareFollowupSchema } from "@/lib/agenttalkie-contract";
import { AgentTalkieError } from "@/lib/server/agenttalkie-service";
export async function POST(request:Request){try{const owner=liveOwner(request);const input=PrepareFollowupSchema.parse(await readJson(request));const result=await mutate(owner,input.sessionId,s=>{const r=s.requests.find(x=>x.requestId===input.requestId&&x.revision===input.revision);if(s.status!=="active"||!r||r.state!=="completed"||s.activeRequestId!==r.requestId||s.activeRevision!==r.revision)throw new AgentTalkieError(409,"STALE_FOLLOWUP","The current result is required.");s.preparedFollowup={requestId:r.requestId,revision:r.revision,projectId:r.projectId,agentId:r.agentId,workerSessionId:r.workerSessionId,recipient:liveTarget.agentName,scope:input.scope,preparedAt:new Date().toISOString(),status:"prepared"};});return jsonReply({followup:result.session.preparedFollowup});}catch(error){return apiFailure(error);}}
