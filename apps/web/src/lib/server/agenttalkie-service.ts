import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AGENTTALKIE_CONTRACT_VERSION, AgentTargetSchema, PrepareFollowupSchema,
  SessionSnapshotSchema, SubmitRequestSchema, WorkerOutcomeSchema,
  type AgentTalkieAdapter, type AgentTarget, type PreparedFollowup,
  type RequestRecord, type SessionSnapshot, type VoiceSession, type WorkerRequest,
} from "../agenttalkie-contract";

export class AgentTalkieError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type StoredSession = { owner: string; session: VoiceSession };
const targetKey = (target: Pick<AgentTarget, "projectId" | "agentId" | "workerSessionId">) =>
  JSON.stringify([target.projectId, target.agentId, target.workerSessionId]);
const identityKeys = ["requestId", "revision", "projectId", "agentId", "workerSessionId"] as const;

export class AgentTalkieService {
  private sessions = new Map<string, StoredSession>();
  private workers = new Map<string, { target: AgentTarget; adapter: AgentTalkieAdapter }>();
  private jobs = new Map<string, Promise<void>>();
  private now: () => string;
  private requestTimeoutMs: number;

  constructor(options: { adapters: AgentTalkieAdapter[]; now?: () => string; requestTimeoutMs?: number }) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 25000;
    for (const adapter of options.adapters) {
      for (const input of adapter.targets) {
        const target = AgentTargetSchema.parse(input);
        const key = targetKey(target);
        if (this.workers.has(key)) throw new Error("Duplicate AgentTalkie target configuration.");
        this.workers.set(key, { target, adapter });
      }
    }
  }

  targets(mode?: "fixture" | "live"): AgentTarget[] {
    return structuredClone([...this.workers.values()].map(({ target }) => target)
      .filter((target) => !mode || target.evidenceMode === mode));
  }

  create(owner: string, mode: "fixture" | "live"): SessionSnapshot {
    z.enum(["fixture", "live"]).parse(mode);
    // This first slice is process-local. Bound retention; restart drops sessions.
    const oldest = Date.parse(this.now()) - 4 * 60 * 60 * 1000;
    for (const [key, value] of this.sessions) {
      if (Date.parse(value.session.createdAt) < oldest) this.sessions.delete(key);
    }
    if (this.sessions.size >= 100) throw new AgentTalkieError(503, "SESSION_LIMIT", "End unused sessions or restart the local demo.");
    const session: VoiceSession = {
      id: randomUUID(), mode, status: "active", createdAt: this.now(),
      activeRequestId: null, activeRevision: null, requests: [], preparedFollowup: null,
    };
    this.sessions.set(session.id, { owner, session });
    return this.snapshot(owner, session.id);
  }

  private get(owner: string, sessionId: string): VoiceSession {
    const stored = this.sessions.get(sessionId);
    if (!stored || stored.owner !== owner) throw new AgentTalkieError(404, "SESSION_NOT_FOUND", "Start a new conversation in this browser.");
    return stored.session;
  }

  private active(owner: string, sessionId: string): VoiceSession {
    const session = this.get(owner, sessionId);
    if (session.status !== "active") throw new AgentTalkieError(409, "SESSION_ENDED", "This conversation has ended.");
    return session;
  }

  snapshot(owner: string, sessionId: string): SessionSnapshot {
    const session = this.get(owner, sessionId);
    const current = session.requests.find((request) => request.requestId === session.activeRequestId && request.revision === session.activeRevision);
    return SessionSnapshotSchema.parse({
      contractVersion: AGENTTALKIE_CONTRACT_VERSION, session,
      currentResult: session.status === "active" && current?.state === "completed" ? current.result : null,
      targets: this.targets(session.mode),
    });
  }

  submit(owner: string, raw: z.infer<typeof SubmitRequestSchema>): { snapshot: SessionSnapshot; completion: Promise<void> } {
    const { sessionId, ...input } = SubmitRequestSchema.parse(raw);
    const session = this.active(owner, sessionId);
    const worker = this.workers.get(targetKey(input));
    if (!worker || worker.target.evidenceMode !== session.mode) {
      throw new AgentTalkieError(403, "TARGET_NOT_ALLOWED", "Select an allowed project and its exact worker session.");
    }
    const jobKey = `${sessionId}:${input.requestId}:${input.revision}`;
    const existing = session.requests.find((request) => request.requestId === input.requestId && request.revision === input.revision);
    if (existing) {
      if (identityKeys.some((key) => existing[key] !== input[key]) || existing.question !== input.question) {
        throw new AgentTalkieError(409, "REQUEST_CONFLICT", "This request revision already has a different question or target.");
      }
      return { snapshot: this.snapshot(owner, sessionId), completion: this.jobs.get(jobKey) ?? Promise.resolve() };
    }
    const earlier = session.requests.filter((request) => request.requestId === input.requestId);
    const previous = earlier.at(-1);
    if (input.revision !== (previous?.revision ?? 0) + 1 || (previous && session.activeRequestId !== input.requestId)) {
      throw new AgentTalkieError(409, "STALE_REVISION", "Correct the active request using its next revision, or start a new request ID.");
    }
    if (session.requests.length >= 100) throw new AgentTalkieError(409, "REQUEST_LIMIT", "Start a new conversation after 100 question revisions.");
    for (const request of session.requests) {
      if (request.requestId === session.activeRequestId && request.revision === session.activeRevision) {
        request.state = "superseded";
        request.updatedAt = this.now();
      }
    }
    const record: RequestRecord = { ...input, state: "pending", createdAt: this.now(), updatedAt: this.now(), result: null, error: null };
    session.requests.push(record);
    session.activeRequestId = input.requestId;
    session.activeRevision = input.revision;
    session.preparedFollowup = null;
    const completion = this.execute(session, record, worker).finally(() => this.jobs.delete(jobKey));
    this.jobs.set(jobKey, completion);
    return { snapshot: this.snapshot(owner, sessionId), completion };
  }

  private async execute(session: VoiceSession, record: RequestRecord, worker: { target: AgentTarget; adapter: AgentTalkieAdapter }) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { requestId, revision, projectId, agentId, workerSessionId, question } = record;
      const input: WorkerRequest = { requestId, revision, projectId, agentId, workerSessionId, question };
      const unavailable = { status: "unavailable", code: "WORKER_UNAVAILABLE", message: worker.target.unavailableReason ?? "Worker unavailable." };
      const raw = await Promise.race([
        worker.target.availability === "unavailable" ? Promise.resolve(unavailable) : Promise.resolve().then(() => worker.adapter.execute(input)),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ status: "unavailable", code: "WORKER_TIMEOUT", message: "No worker result arrived within the wait window. Remote completion is unknown; no retry was sent." }), this.requestTimeoutMs); }),
      ]);
      const outcome = WorkerOutcomeSchema.parse(raw);
      if (outcome.status === "completed") {
        if (identityKeys.some((key) => outcome.result[key] !== record[key])) {
          throw new Error("Worker result identity mismatch.");
        }
        const fixtureEvidence = outcome.result.evidence.some((evidence) => evidence.kind === "fixture");
        if ((session.mode === "live" && fixtureEvidence) || (session.mode === "fixture" && outcome.result.evidence.some((evidence) => evidence.kind !== "fixture"))) {
          throw new Error("Worker evidence mode mismatch.");
        }
        record.result = outcome.result;
        if (record.state !== "superseded") record.state = "completed";
      } else {
        record.error = { code: outcome.code, message: outcome.message };
        if (record.state !== "superseded") record.state = outcome.status;
      }
    } catch {
      record.error = { code: "INVALID_WORKER_RESULT", message: "The worker did not return a valid result for this request." };
      if (record.state !== "superseded") record.state = "failed";
    } finally {
      if (timer) clearTimeout(timer);
      record.updatedAt = this.now();
    }
  }

  end(owner: string, sessionId: string): SessionSnapshot {
    const session = this.get(owner, sessionId);
    session.status = "ended";
    session.preparedFollowup = null;
    for (const request of session.requests) {
      if (request.state === "pending") { request.state = "superseded"; request.updatedAt = this.now(); }
    }
    return this.snapshot(owner, sessionId);
  }

  prepare(owner: string, raw: z.infer<typeof PrepareFollowupSchema>): PreparedFollowup {
    const input = PrepareFollowupSchema.parse(raw);
    const session = this.active(owner, input.sessionId);
    const request = session.requests.find((item) => item.requestId === input.requestId && item.revision === input.revision);
    if (!request || request.requestId !== session.activeRequestId || request.revision !== session.activeRevision || request.state !== "completed") {
      throw new AgentTalkieError(409, "STALE_FOLLOWUP", "Prepare a follow-up only from the latest completed answer.");
    }
    const target = this.workers.get(targetKey(request))!.target;
    session.preparedFollowup = {
      requestId: request.requestId, revision: request.revision, projectId: request.projectId,
      agentId: request.agentId, workerSessionId: request.workerSessionId,
      recipient: target.agentName, scope: input.scope, preparedAt: this.now(), status: "prepared",
    };
    return structuredClone(session.preparedFollowup);
  }
}
