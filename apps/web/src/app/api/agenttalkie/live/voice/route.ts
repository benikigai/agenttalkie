import { randomUUID } from "node:crypto";
import { liveOwner } from "@/lib/server/agenttalkie-live-auth";
import { load,snapshot,sql } from "@/lib/server/agenttalkie-live-store";
import { createAgentTalkieVoiceHandler } from "@/lib/server/agenttalkie-voice";
import { AgentTalkieError } from "@/lib/server/agenttalkie-service";
export const maxDuration=30;
export const POST=createAgentTalkieVoiceHandler({
 service:{snapshot(){throw new Error("Async store required");}},authorize:liveOwner,
 snapshot:async(owner,id)=>snapshot((await load(owner,id)).session),
 claim:async(owner,id,offerHash)=>{
  const claim=await sql()`INSERT INTO agenttalkie_voice_offers(thread_id,offer_hash) VALUES(${id},${offerHash}) ON CONFLICT DO NOTHING RETURNING thread_id`;
  if(!claim.length)throw new AgentTalkieError(409,"VOICE_ALREADY_ATTEMPTED","This voice connection was already attempted. Start a new connection to reconnect.");
  const rows=await sql()`INSERT INTO agenttalkie_voice_budget(owner,day,attempts) VALUES(${owner},current_date,1) ON CONFLICT(owner,day) DO UPDATE SET attempts=agenttalkie_voice_budget.attempts+1 WHERE agenttalkie_voice_budget.attempts<12 RETURNING attempts`;
  if(!rows.length)throw new AgentTalkieError(429,"VOICE_LIMIT","The demo has reached its daily voice session limit.");
  await sql()`INSERT INTO agenttalkie_voice_attempts(id,owner,thread_id) VALUES(${randomUUID()},${owner},${id})`;
 },enabled:()=>process.env.AGENTTALKIE_LIVE_VOICE_ENABLED==="true",apiKey:()=>process.env.OPENAI_API_KEY,
});
