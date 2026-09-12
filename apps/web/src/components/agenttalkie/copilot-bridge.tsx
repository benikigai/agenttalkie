"use client";

import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { findAllowedTarget, isCurrentResultIdentity } from "@/lib/agenttalkie-copilot";
import type { AgentTalkieWorkspace } from "./provider";

const targetParameters = z.object({
  projectId: z.string().min(1).max(200),
  agentId: z.string().min(1).max(200),
  workerSessionId: z.string().min(1).max(200),
}).strict();

const questionParameters = z.object({
  question: z.string().trim().min(1).max(4000),
  correction: z.boolean().default(false),
}).strict();

const followupParameters = z.object({
  requestId: z.uuid(),
  revision: z.number().int().positive(),
}).strict();

function failure(code: string, message: string) {
  return { status: "error" as const, code, message };
}

export function AgentTalkieCopilotBridge({ workspace }: { workspace: AgentTalkieWorkspace }) {
  const { snapshot, target, currentRequest, answer, followup } = workspace;

  useAgentContext({
    description: "The validated AgentTalkie work currently visible to the user. Use only the listed allowed targets and registered frontend tools. Results are current only when their request ID, revision, and target match this context. A follow-up with status prepared has not been sent or saved.",
    value: {
      contractVersion: snapshot.contractVersion,
      selectedProject: { id: target.projectId, name: target.projectName },
      selectedTarget: {
        projectId: target.projectId,
        agentId: target.agentId,
        agentName: target.agentName,
        workerSessionId: target.workerSessionId,
        provider: target.provider,
        evidenceMode: target.evidenceMode,
        availability: target.availability,
        unavailableReason: target.unavailableReason,
      },
      allowedTargets: snapshot.targets.map((item) => ({
        projectId: item.projectId,
        projectName: item.projectName,
        agentId: item.agentId,
        agentName: item.agentName,
        workerSessionId: item.workerSessionId,
        evidenceMode: item.evidenceMode,
        availability: item.availability,
      })),
      applicationSession: {
        id: snapshot.session.id,
        mode: snapshot.session.mode,
        status: snapshot.session.status,
      },
      currentRequest: currentRequest ? {
        requestId: currentRequest.requestId,
        revision: currentRequest.revision,
        question: currentRequest.question,
        state: currentRequest.state,
        agentId: currentRequest.agentId,
        workerSessionId: currentRequest.workerSessionId,
        error: currentRequest.error,
      } : null,
      currentResult: answer ? {
        requestId: answer.requestId,
        revision: answer.revision,
        answerSummary: answer.answer.slice(0, 4000),
        answerTruncated: answer.answer.length > 4000,
        evidenceCount: answer.evidence.length,
        evidence: answer.evidence.slice(0, 8).map((item) => ({
          kind: item.kind,
          reference: item.reference,
          sourceObservedAt: item.sourceObservedAt,
          retrievedAt: item.retrievedAt,
        })),
      } : null,
      preparedAction: followup ? {
        requestId: followup.requestId,
        revision: followup.revision,
        recipient: followup.recipient,
        workerSessionId: followup.workerSessionId,
        scope: followup.scope,
        status: followup.status,
        preparedAt: followup.preparedAt,
        delivery: "not_sent",
        persistence: "not_saved",
      } : null,
      uiState: {
        ready: workspace.ready,
        loading: workspace.loading,
        submitting: workspace.submitting,
        preparing: workspace.preparing,
        error: workspace.error,
      },
    },
  });

  useFrontendTool({
    name: "agenttalkie_select_target",
    description: "Select one target already listed in allowedTargets. The exact project, agent, and worker session IDs must match. This changes the visible target and invalidates an older target's result as current.",
    parameters: targetParameters,
    handler: async (identity) => {
      const allowed = findAllowedTarget(snapshot.targets, identity);
      if (!allowed) return failure("TARGET_NOT_ALLOWED", "That target is not in the current allowed target list.");
      workspace.selectTarget(allowed);
      return { status: "selected" as const, target: { projectId: allowed.projectId, projectName: allowed.projectName, agentId: allowed.agentId, agentName: allowed.agentName, workerSessionId: allowed.workerSessionId, availability: allowed.availability } };
    },
  }, [snapshot.targets, workspace.selectTarget]);

  useFrontendTool({
    name: "agenttalkie_ask_question",
    description: "Ask the selected AgentTalkie target a question through the validated application command path. Set correction true only to revise the current request for this same target. The returned state may be pending and is not proof of completion.",
    parameters: questionParameters,
    handler: async ({ question, correction }) => {
      if (!workspace.ready || snapshot.session.status !== "active") return failure("SESSION_NOT_READY", "The AgentTalkie session is not ready for a question.");
      if (target.availability === "unavailable") return failure("TARGET_UNAVAILABLE", target.unavailableReason ?? "The selected target is unavailable.");
      if (correction && !currentRequest) return failure("NO_CURRENT_REQUEST", "There is no current request to correct.");
      const request = await workspace.sendQuestion(question, correction);
      return request ? { status: "accepted" as const, request } : failure("REQUEST_NOT_ACCEPTED", workspace.error ?? "The question was not accepted.");
    },
  }, [workspace.ready, workspace.sendQuestion, workspace.error, snapshot.session.status, target, currentRequest]);

  useFrontendTool({
    name: "agenttalkie_prepare_followup",
    description: "Prepare the current result as a human-review action. This does not send or save anything. requestId and revision must exactly match the current attributed result shown in AgentTalkie.",
    parameters: followupParameters,
    handler: async ({ requestId, revision }) => {
      if (!isCurrentResultIdentity(answer, { requestId, revision })) return failure("STALE_RESULT", "That result is no longer current. Review the visible current result first.");
      const prepared = await workspace.prepare();
      return prepared
        ? { status: prepared.status, prepared, delivery: "not_sent" as const, persistence: "not_saved" as const }
        : failure("PREPARE_NOT_CONFIRMED", "The application did not confirm a prepared follow-up.");
    },
  }, [answer, workspace.prepare]);

  return null;
}
