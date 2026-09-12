import { z } from "zod";

export const AGENTTALKIE_CONTRACT_VERSION = "AT-contract-0.1" as const;
export const AGENTTALKIE_ROUTES = {
  session: "/api/agenttalkie/session",
  requests: "/api/agenttalkie/requests",
  followup: "/api/agenttalkie/followup",
  voice: "/api/agenttalkie/voice",
} as const;

const id = z.string().min(1).max(200);
const timestamp = z.iso.datetime({ offset: true });
export const EvidenceKindSchema = z.enum(["worker_reply", "source_read", "checkpoint", "fixture"]);
export const RequestStateSchema = z.enum(["pending", "completed", "failed", "unavailable", "superseded"]);
export const AgentTargetSchema = z.object({
  projectId: id,
  projectName: z.string().min(1),
  agentId: id,
  agentName: z.string().min(1),
  workerSessionId: id,
  provider: z.string().min(1),
  evidenceMode: z.enum(["fixture", "live"]),
  availability: z.enum(["available", "unavailable"]),
  unavailableReason: z.string().nullable(),
}).strict();
export const RequestIdentitySchema = z.object({
  requestId: z.uuid(),
  revision: z.number().int().positive(),
  projectId: id,
  agentId: id,
  workerSessionId: id,
}).strict();
export const WorkerRequestSchema = RequestIdentitySchema.extend({
  question: z.string().trim().min(1).max(4000),
}).strict();
export const EvidenceSchema = z.object({
  kind: EvidenceKindSchema,
  reference: z.string().min(1).max(2000),
  sourceObservedAt: timestamp.nullable(),
  retrievedAt: timestamp,
}).strict();
export const WorkerResultSchema = RequestIdentitySchema.extend({
  answer: z.string().min(1).max(12000),
  evidence: z.array(EvidenceSchema).min(1).max(20),
}).strict();
export const WorkerOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed"), result: WorkerResultSchema }).strict(),
  z.object({ status: z.enum(["unavailable", "failed"]), code: id, message: z.string().min(1).max(2000) }).strict(),
]);
export const RequestRecordSchema = WorkerRequestSchema.extend({
  state: RequestStateSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  result: WorkerResultSchema.nullable(),
  error: z.object({ code: id, message: z.string() }).strict().nullable(),
}).strict();
export const PreparedFollowupSchema = RequestIdentitySchema.extend({
  recipient: z.string().min(1),
  scope: z.string().trim().min(1).max(4000),
  preparedAt: timestamp,
  status: z.literal("prepared"),
}).strict();
export const VoiceSessionSchema = z.object({
  id: z.uuid(),
  mode: z.enum(["fixture", "live"]),
  status: z.enum(["active", "ended"]),
  createdAt: timestamp,
  activeRequestId: z.uuid().nullable(),
  activeRevision: z.number().int().positive().nullable(),
  requests: z.array(RequestRecordSchema),
  preparedFollowup: PreparedFollowupSchema.nullable(),
}).strict();
export const SessionSnapshotSchema = z.object({
  contractVersion: z.literal(AGENTTALKIE_CONTRACT_VERSION),
  session: VoiceSessionSchema,
  currentResult: WorkerResultSchema.nullable(),
  targets: z.array(AgentTargetSchema),
}).strict();
export const SessionBootstrapSchema = z.object({
  contractVersion: z.literal(AGENTTALKIE_CONTRACT_VERSION),
  targets: z.array(AgentTargetSchema),
  persistence: z.enum(["local_process", "client_fixture"]),
  voice: z.object({
    provider: z.literal("openai"),
    model: z.literal("gpt-live-1"),
    status: z.literal("unverified"),
  }).strict(),
}).strict();
export const SessionCommandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), mode: z.enum(["fixture", "live"]).default("fixture") }).strict(),
  z.object({ operation: z.literal("end"), sessionId: z.uuid() }).strict(),
]);
export const SubmitRequestSchema = WorkerRequestSchema.extend({ sessionId: z.uuid() }).strict();
export const PrepareFollowupSchema = z.object({
  sessionId: z.uuid(), requestId: z.uuid(), revision: z.number().int().positive(),
  scope: z.string().trim().min(1).max(4000),
}).strict();
export const CreateVoiceSchema = z.object({ sessionId: z.uuid(), sdp: z.string().min(1).max(100000) }).strict();
export const VoiceConnectionSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.literal("openai"),
  model: z.literal("gpt-live-1"),
  sdp: z.string().min(1),
}).strict();
export const ApiErrorSchema = z.object({ error: z.object({ code: id, message: z.string() }).strict() }).strict();

export type AgentTarget = z.infer<typeof AgentTargetSchema>;
export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;
export type WorkerResult = z.infer<typeof WorkerResultSchema>;
export type WorkerOutcome = z.infer<typeof WorkerOutcomeSchema>;
export type RequestRecord = z.infer<typeof RequestRecordSchema>;
export type PreparedFollowup = z.infer<typeof PreparedFollowupSchema>;
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;
export type SessionBootstrap = z.infer<typeof SessionBootstrapSchema>;

// TOOLS implements this boundary. Targets come from trusted server configuration.
export interface AgentTalkieAdapter {
  targets: readonly AgentTarget[];
  execute(request: WorkerRequest): Promise<WorkerOutcome>;
}

// GET session bootstraps an HttpOnly browser cookie and returns targets. With
// ?sessionId=... it returns SessionSnapshot. POST session takes SessionCommand.
// POST requests takes SubmitRequest and returns a snapshot (202 while pending).
// Poll GET session for completion. Correct with the SAME requestId and revision+1.
// Exact retries are idempotent; changed bodies at an existing revision return 409.
// POST followup takes PrepareFollowup and returns { followup }; it never sends.
// POST voice takes CreateVoice and returns VoiceConnection or a typed 503.
