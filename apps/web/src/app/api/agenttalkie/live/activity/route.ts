import { z } from "zod";
import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { sql,load } from "@/lib/server/agenttalkie-live-store";
import { apiFailure,jsonReply } from "@/lib/server/agenttalkie-http";
export async function GET(request:Request){try{const owner=liveOwner(request);const id=z.uuid().parse(new URL(request.url).searchParams.get("sessionId"));await load(owner,id);const rows=await sql()`SELECT * FROM agenttalkie_events WHERE owner=${owner} AND thread_id=${id} ORDER BY observed_at DESC LIMIT 50`;return jsonReply({contractVersion:"AT-activity-0.1",cursor:rows[0]?.id??"empty",events:rows.map(r=>({eventId:r.id,operationId:r.request_id,requestId:r.request_id,revision:r.revision,provider:r.provider,kind:r.state==="failed"?"failure":"provider_request",state:r.state,label:r.label,observedAt:new Date(r.observed_at).toISOString(),evidenceMode:"live",details:r.details}))});}catch(error){return apiFailure(error);}}
