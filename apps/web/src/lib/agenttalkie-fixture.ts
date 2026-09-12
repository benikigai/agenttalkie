import {
  AGENTTALKIE_CONTRACT_VERSION, AgentTargetSchema, SessionSnapshotSchema,
  WorkerRequestSchema, WorkerResultSchema,
} from "./agenttalkie-contract";

export const agenttalkieFixtureTarget = AgentTargetSchema.parse({
  projectId: "agenttalkie-demo", projectName: "AgentTalkie demo",
  agentId: "demo-worker", agentName: "Demo worker",
  workerSessionId: "fixture:agenttalkie:worker-session", provider: "fixture",
  evidenceMode: "fixture", availability: "available", unavailableReason: null,
});
export const agenttalkieUnavailableTarget = AgentTargetSchema.parse({
  ...agenttalkieFixtureTarget, agentId: "unavailable-worker", agentName: "Unavailable worker",
  workerSessionId: "fixture:agenttalkie:unavailable", availability: "unavailable",
  unavailableReason: "This fixture worker is deliberately unavailable.",
});
export const agenttalkieFixtureRequest = WorkerRequestSchema.parse({
  requestId: "00000000-0000-4000-8000-000000000001", revision: 1,
  projectId: agenttalkieFixtureTarget.projectId, agentId: agenttalkieFixtureTarget.agentId,
  workerSessionId: agenttalkieFixtureTarget.workerSessionId,
  question: "What is blocking the AgentTalkie demo?",
});
export const agenttalkieFixtureResult = WorkerResultSchema.parse({
  requestId: agenttalkieFixtureRequest.requestId, revision: 1,
  projectId: agenttalkieFixtureTarget.projectId, agentId: agenttalkieFixtureTarget.agentId,
  workerSessionId: agenttalkieFixtureTarget.workerSessionId,
  answer: "Fixture: the interface is ready for review. Live voice access and an existing worker session still need verification.",
  evidence: [{ kind: "fixture", reference: "fixture:agenttalkie:build-checkpoint",
    sourceObservedAt: "2026-09-12T19:00:00Z", retrievedAt: "2026-09-12T19:01:00Z" }],
});
export const agenttalkieFixture = SessionSnapshotSchema.parse({
  contractVersion: AGENTTALKIE_CONTRACT_VERSION,
  targets: [agenttalkieFixtureTarget, agenttalkieUnavailableTarget],
  currentResult: agenttalkieFixtureResult,
  session: {
    id: "00000000-0000-4000-8000-000000000002", mode: "fixture", status: "active",
    createdAt: "2026-09-12T19:00:00Z", activeRequestId: agenttalkieFixtureRequest.requestId,
    activeRevision: 1,
    requests: [{ ...agenttalkieFixtureRequest, state: "completed",
      createdAt: "2026-09-12T19:00:00Z", updatedAt: "2026-09-12T19:01:00Z",
      result: agenttalkieFixtureResult, error: null }],
    preparedFollowup: null,
  },
});
