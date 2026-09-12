import {
  AGENTTALKIE_CONTRACT_VERSION, PrepareFollowupSchema, SessionSnapshotSchema, WorkerRequestSchema,
  type AgentTarget, type PreparedFollowup, type RequestRecord,
  type SessionSnapshot, type WorkerRequest, type WorkerResult,
} from "../agenttalkie-contract";
import {
  agenttalkieFixtureResult, agenttalkieFixtureTarget, agenttalkieUnavailableTarget,
} from "../agenttalkie-fixture";

export class ClientFixtureError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const sessions = new Map<string, SessionSnapshot>();
const targets = [agenttalkieFixtureTarget, agenttalkieUnavailableTarget];
const sameIdentity = (left: WorkerRequest, right: WorkerRequest) =>
  left.requestId === right.requestId && left.revision === right.revision &&
  left.projectId === right.projectId && left.agentId === right.agentId &&
  left.workerSessionId === right.workerSessionId && left.question === right.question;
const sameTarget = (left: Pick<AgentTarget, "projectId" | "agentId" | "workerSessionId">, right: Pick<AgentTarget, "projectId" | "agentId" | "workerSessionId">) =>
  left.projectId === right.projectId && left.agentId === right.agentId && left.workerSessionId === right.workerSessionId;
const clone = <T>(value: T): T => structuredClone(value);

function get(sessionId: string): SessionSnapshot {
  const snapshot = sessions.get(sessionId);
  if (!snapshot) throw new ClientFixtureError("SESSION_NOT_FOUND", "Start a new conversation in this browser.");
  return snapshot;
}

function current(snapshot: SessionSnapshot): WorkerResult | null {
  if (snapshot.session.status !== "active") return null;
  return snapshot.session.requests.find((request) =>
    request.requestId === snapshot.session.activeRequestId &&
    request.revision === snapshot.session.activeRevision &&
    request.state === "completed")?.result ?? null;
}

function read(snapshot: SessionSnapshot): SessionSnapshot {
  snapshot.currentResult = current(snapshot);
  return SessionSnapshotSchema.parse(clone(snapshot));
}

export function hasClientFixtureSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

export function createClientFixtureSession(): SessionSnapshot {
  if (sessions.size >= 20) sessions.delete(sessions.keys().next().value!);
  const now = new Date().toISOString();
  const snapshot = SessionSnapshotSchema.parse({
    contractVersion: AGENTTALKIE_CONTRACT_VERSION,
    targets,
    currentResult: null,
    session: {
      id: crypto.randomUUID(), mode: "fixture", status: "active", createdAt: now,
      activeRequestId: null, activeRevision: null, requests: [], preparedFollowup: null,
    },
  });
  sessions.set(snapshot.session.id, snapshot);
  return read(snapshot);
}

export function readClientFixtureSession(sessionId: string): SessionSnapshot {
  return read(get(sessionId));
}

export function submitClientFixtureQuestion(sessionId: string, raw: WorkerRequest): SessionSnapshot {
  const snapshot = get(sessionId);
  if (snapshot.session.status !== "active") throw new ClientFixtureError("SESSION_ENDED", "This conversation has ended.");
  const request = WorkerRequestSchema.parse(raw);
  const target = targets.find((candidate) => sameTarget(candidate, request));
  if (!target) throw new ClientFixtureError("TARGET_NOT_ALLOWED", "Select an allowed fixture worker.");
  const existing = snapshot.session.requests.find((item) => item.requestId === request.requestId && item.revision === request.revision);
  if (existing) {
    if (!sameIdentity(existing, request)) throw new ClientFixtureError("REQUEST_CONFLICT", "This request revision already has a different question or target.");
    return read(snapshot);
  }
  const earlier = snapshot.session.requests.filter((item) => item.requestId === request.requestId);
  const previous = earlier.at(-1);
  if (request.revision !== (previous?.revision ?? 0) + 1 || (previous && snapshot.session.activeRequestId !== request.requestId)) {
    throw new ClientFixtureError("STALE_REVISION", "Correct the active request using its next revision, or start a new request ID.");
  }
  if (snapshot.session.requests.length >= 100) throw new ClientFixtureError("REQUEST_LIMIT", "Start a new conversation after 100 question revisions.");
  const now = new Date().toISOString();
  for (const item of snapshot.session.requests) {
    if (item.requestId === snapshot.session.activeRequestId && item.revision === snapshot.session.activeRevision) {
      item.state = "superseded"; item.updatedAt = now;
    }
  }
  let record: RequestRecord;
  if (target.availability === "unavailable") {
    record = { ...request, state: "unavailable", createdAt: now, updatedAt: now, result: null,
      error: { code: "WORKER_UNAVAILABLE", message: target.unavailableReason ?? "Fixture worker unavailable." } };
  } else {
    const result: WorkerResult = {
      requestId: request.requestId, revision: request.revision,
      projectId: request.projectId, agentId: request.agentId, workerSessionId: request.workerSessionId,
      answer: agenttalkieFixtureResult.answer,
      evidence: agenttalkieFixtureResult.evidence.map((evidence) => ({ ...evidence, retrievedAt: now })),
    };
    record = { ...request, state: "completed", createdAt: now, updatedAt: now, result, error: null };
  }
  snapshot.session.requests.push(record);
  snapshot.session.activeRequestId = request.requestId;
  snapshot.session.activeRevision = request.revision;
  snapshot.session.preparedFollowup = null;
  return read(snapshot);
}

export function endClientFixtureSession(sessionId: string): SessionSnapshot {
  const snapshot = get(sessionId);
  snapshot.session.status = "ended";
  snapshot.session.preparedFollowup = null;
  return read(snapshot);
}

export function prepareClientFixtureFollowup(sessionId: string, requestId: string, revision: number, scope: string): PreparedFollowup {
  const snapshot = get(sessionId);
  if (snapshot.session.status !== "active") throw new ClientFixtureError("SESSION_ENDED", "This conversation has ended.");
  const input = PrepareFollowupSchema.parse({ sessionId, requestId, revision, scope });
  const request = snapshot.session.requests.find((item) => item.requestId === input.requestId && item.revision === input.revision);
  if (!request || request.requestId !== snapshot.session.activeRequestId || request.revision !== snapshot.session.activeRevision || request.state !== "completed") {
    throw new ClientFixtureError("STALE_FOLLOWUP", "Prepare a follow-up only from the latest completed fixture answer.");
  }
  const target = targets.find((candidate) => sameTarget(candidate, request))!;
  const prepared: PreparedFollowup = {
    requestId, revision, projectId: request.projectId, agentId: request.agentId,
    workerSessionId: request.workerSessionId, recipient: target.agentName, scope: input.scope,
    preparedAt: new Date().toISOString(), status: "prepared",
  };
  snapshot.session.preparedFollowup = prepared;
  read(snapshot);
  return clone(prepared);
}
