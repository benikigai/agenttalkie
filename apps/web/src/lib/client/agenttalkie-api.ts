import { z } from "zod";
import {
  AGENTTALKIE_ROUTES, ApiErrorSchema, PreparedFollowupSchema,
  SessionSnapshotSchema, type WorkerRequest,
} from "../agenttalkie-contract";

export class AgentTalkieApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
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

export async function createSession(mode: "fixture" | "live", signal?: AbortSignal) {
  await request(AGENTTALKIE_ROUTES.session, undefined, signal);
  return SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.session, { operation: "create", mode }, signal));
}

export async function readSession(sessionId: string, signal?: AbortSignal) {
  return SessionSnapshotSchema.parse(await request(`${AGENTTALKIE_ROUTES.session}?sessionId=${encodeURIComponent(sessionId)}`, undefined, signal));
}

export async function submitQuestion(sessionId: string, question: WorkerRequest) {
  return SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.requests, { sessionId, ...question }));
}

export async function endSession(sessionId: string) {
  return SessionSnapshotSchema.parse(await request(AGENTTALKIE_ROUTES.session, { operation: "end", sessionId }));
}

export async function prepareFollowup(sessionId: string, requestId: string, revision: number, scope: string) {
  const schema = z.object({ followup: PreparedFollowupSchema });
  return schema.parse(await request(AGENTTALKIE_ROUTES.followup, { sessionId, requestId, revision, scope })).followup;
}
