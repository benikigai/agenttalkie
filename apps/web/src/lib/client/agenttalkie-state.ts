import type { AgentTarget, SessionSnapshot, WorkerRequest, WorkerResult } from "../agenttalkie-contract";

export function sameTarget(a: Pick<AgentTarget, "projectId" | "agentId" | "workerSessionId">, b: Pick<AgentTarget, "projectId" | "agentId" | "workerSessionId">) {
  return a.projectId === b.projectId && a.agentId === b.agentId && a.workerSessionId === b.workerSessionId;
}

export function matchesRequest(result: WorkerResult, request: WorkerRequest) {
  return result.requestId === request.requestId && result.revision === request.revision && sameTarget(result, request);
}

export function currentAnswer(snapshot: SessionSnapshot, target: AgentTarget, pending: WorkerRequest | null) {
  const result = snapshot.currentResult;
  if (!result || !sameTarget(result, target)) return null;
  if (pending && !matchesRequest(result, pending)) return null;
  if (result.requestId !== snapshot.session.activeRequestId || result.revision !== snapshot.session.activeRevision) return null;
  const record = snapshot.session.requests.find((request) => matchesRequest(result, request));
  return record?.state === "completed" ? result : null;
}

export function isCurrentFollowup(snapshot: SessionSnapshot, pending: WorkerRequest | null) {
  const followup = snapshot.session.preparedFollowup;
  if (!followup || snapshot.session.activeRequestId !== followup.requestId || snapshot.session.activeRevision !== followup.revision) return false;
  return !pending || (pending.requestId === followup.requestId && pending.revision === followup.revision && sameTarget(pending, followup));
}

export function safeSourceUrl(reference: string) {
  try {
    const url = new URL(reference);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
