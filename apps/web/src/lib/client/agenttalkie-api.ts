import { z } from "zod";
import {
  AGENTTALKIE_ROUTES, ApiErrorSchema, PreparedFollowupSchema,
  SessionBootstrapSchema, SessionSnapshotSchema, type WorkerRequest,
} from "../agenttalkie-contract";
import {
  ClientFixtureError, createClientFixtureSession, endClientFixtureSession,
  hasClientFixtureSession, prepareClientFixtureFollowup, readClientFixtureSession,
  submitClientFixtureQuestion,
} from "./agenttalkie-fixture-client";

export class AgentTalkieApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function clientFixture<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof ClientFixtureError) throw new AgentTalkieApiError(error.code, error.message);
    throw error;
  }
}

async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin", cache: "no-store", signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(data);
    throw new AgentTalkieApiError(parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      parsed.success ? parsed.data.error.message : `The workspace could not be reached (${response.status}).`);
  }
  return data;
}

const liveSessions = new Set<string>();
export async function liveAuthentication() { return await request("/api/agenttalkie/live/auth") as {authenticated: boolean}; }
export async function unlockLive(password: string) { return request("/api/agenttalkie/live/auth", {password}); }
export async function delegateVoice(sessionId: string, delegationId: string, transcript: {role: "user" | "assistant"; text: string}[]) {
 return request("/api/agenttalkie/live/delegation",{sessionId,delegationId,transcript});
}

export async function createSession(mode: "fixture" | "live", signal?: AbortSignal) {
  if (mode === "live") { const result = SessionSnapshotSchema.parse(await request("/api/agenttalkie/live/session", undefined, signal)); liveSessions.add(result.session.id); return result; }
  const bootstrap = SessionBootstrapSchema.parse(await request(AGENTTALKIE_ROUTES.session, undefined, signal));
  if (bootstrap.persistence === "client_fixture") {
    if (mode !== "fixture") throw new AgentTalkieApiError("PUBLIC_DEMO_FIXTURE_ONLY", "The public demo supports fixture sessions only.");
    return clientFixture(createClientFixtureSession);
  }
  return SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.session, { operation: "create", mode }, signal));
}

export async function readSession(sessionId: string, signal?: AbortSignal) {
  if (liveSessions.has(sessionId)) return SessionSnapshotSchema.parse(await request(`/api/agenttalkie/live/session?sessionId=${encodeURIComponent(sessionId)}`,undefined,signal));
  if (hasClientFixtureSession(sessionId)) return clientFixture(() => readClientFixtureSession(sessionId));
  return SessionSnapshotSchema.parse(await request(`${AGENTTALKIE_ROUTES.session}?sessionId=${encodeURIComponent(sessionId)}`, undefined, signal));
}

export async function submitQuestion(sessionId: string, question: WorkerRequest) {
  if (liveSessions.has(sessionId)) return SessionSnapshotSchema.parse(await request("/api/agenttalkie/live/requests",{sessionId,...question}));
  if (hasClientFixtureSession(sessionId)) return clientFixture(() => submitClientFixtureQuestion(sessionId, question));
  return SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.requests, { sessionId, ...question }));
}

export async function endSession(sessionId: string) {
  if (liveSessions.has(sessionId)) return SessionSnapshotSchema.parse(await request("/api/agenttalkie/live/session",{sessionId}));
  if (hasClientFixtureSession(sessionId)) return clientFixture(() => endClientFixtureSession(sessionId));
  return SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.session, { operation: "end", sessionId }));
}

export async function prepareFollowup(sessionId: string, requestId: string, revision: number, scope: string) {
  if (liveSessions.has(sessionId)) { const body=await request("/api/agenttalkie/live/followup",{sessionId,requestId,revision,scope}); return z.object({followup:PreparedFollowupSchema}).parse(body).followup; }
  if (hasClientFixtureSession(sessionId)) return clientFixture(() => prepareClientFixtureFollowup(sessionId, requestId, revision, scope));
  const schema = z.object({ followup: PreparedFollowupSchema });
  return schema.parse(await request(AGENTTALKIE_ROUTES.followup, { sessionId, requestId, revision, scope })).followup;
}
