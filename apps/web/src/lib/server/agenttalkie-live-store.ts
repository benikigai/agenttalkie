import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { SessionSnapshotSchema, type VoiceSession, type RequestRecord, type SessionSnapshot } from "../agenttalkie-contract";
import { AgentTalkieError } from "./agenttalkie-service";

export const liveTarget = { projectId: "agenttalkie", projectName: "AgentTalkie", agentId: "coordinator", agentName: "Workspace coordinator", workerSessionId: "scoped-workspace", provider: "Ambiguous / Exa", evidenceMode: "live" as const, availability: "available" as const, unavailableReason: null };
export const sql = () => {
  if (!process.env.DATABASE_URL) throw new AgentTalkieError(503, "STORE_UNCONFIGURED", "Live workspace storage is unavailable.");
  return neon(process.env.DATABASE_URL);
};
export function snapshot(session: VoiceSession): SessionSnapshot {
  const current = session.requests.find(r => r.requestId === session.activeRequestId && r.revision === session.activeRevision);
  return SessionSnapshotSchema.parse({ contractVersion: "AT-contract-0.1", session, targets: [liveTarget], currentResult: session.status === "active" && current?.state === "completed" ? current.result : null });
}
export async function load(owner: string, id: string) {
  const rows = await sql()`SELECT data, version FROM agenttalkie_threads WHERE id=${id} AND owner=${owner}`;
  if (!rows[0]) throw new AgentTalkieError(404, "SESSION_NOT_FOUND", "This live thread is unavailable.");
  return { session: snapshot(rows[0].data).session, version: Number(rows[0].version) };
}
export async function mutate(owner: string, id: string, edit: (session: VoiceSession) => void) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { session, version } = await load(owner, id);
    edit(session);
    const data = snapshot(session).session;
    const rows = await sql()`UPDATE agenttalkie_threads SET data=${JSON.stringify(data)}::jsonb, version=version+1, updated_at=now() WHERE id=${id} AND owner=${owner} AND version=${version} RETURNING id`;
    if (rows.length) return snapshot(data);
  }
  throw new AgentTalkieError(409, "CONCURRENT_UPDATE", "The thread changed. Retry this same request.");
}
export async function restore(owner: string) {
  const rows = await sql()`SELECT data FROM agenttalkie_threads WHERE owner=${owner} AND data->>'status'='active' ORDER BY updated_at DESC LIMIT 1`;
  if (rows[0] && rows[0].data.status === "active") return snapshot(rows[0].data);
  const session: VoiceSession = { id: randomUUID(), mode: "live", status: "active", createdAt: new Date().toISOString(), activeRequestId: null, activeRevision: null, requests: [], preparedFollowup: null };
  await sql()`INSERT INTO agenttalkie_threads(id,owner,data) VALUES(${session.id},${owner},${JSON.stringify(session)}::jsonb) ON CONFLICT DO NOTHING`;
  const active = await sql()`SELECT data FROM agenttalkie_threads WHERE owner=${owner} AND data->>'status'='active' LIMIT 1`;
  if (!active[0]) throw new AgentTalkieError(409, "CONCURRENT_UPDATE", "The thread changed. Open it again.");
  return snapshot(active[0].data);
}
export async function recordEvent(owner: string, sessionId: string, request: Pick<RequestRecord,"requestId"|"revision">, provider: string, label: string, state: string, details: Record<string, unknown> = {}) {
  await sql()`INSERT INTO agenttalkie_events(id,owner,thread_id,request_id,revision,provider,label,state,details) VALUES(${randomUUID()},${owner},${sessionId},${request.requestId},${request.revision},${provider},${label},${state},${JSON.stringify(details)}::jsonb)`;
}
