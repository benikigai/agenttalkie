import type { AgentTarget, WorkerResult } from "./agenttalkie-contract";
import { sameTarget } from "./client/agenttalkie-state";

export function findAllowedTarget(
  targets: readonly AgentTarget[],
  identity: Pick<AgentTarget, "projectId" | "agentId" | "workerSessionId">,
) {
  return targets.find((target) => sameTarget(target, identity)) ?? null;
}

export function isCurrentResultIdentity(
  result: Pick<WorkerResult, "requestId" | "revision"> | null,
  identity: Pick<WorkerResult, "requestId" | "revision">,
) {
  return !!result && result.requestId === identity.requestId && result.revision === identity.revision;
}
