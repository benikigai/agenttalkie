import type { AgentTalkieAdapter } from "../agenttalkie-contract";
import { agenttalkieFixtureTarget, agenttalkieUnavailableTarget } from "../agenttalkie-fixture";

export const fixtureAdapter: AgentTalkieAdapter = {
  targets: [agenttalkieFixtureTarget, agenttalkieUnavailableTarget],
  async execute(request) {
    // The first answer is slower so a correction can demonstrably overtake it.
    await new Promise((resolve) => setTimeout(resolve, request.revision === 1 ? 1400 : 200));
    const { question, ...identity } = request;
    return {
      status: "completed",
      result: { ...identity,
        answer: `Fixture response to “${question}”: the interface is ready for review. Live voice access and an existing worker session still need verification.`,
        evidence: [{ kind: "fixture", reference: "fixture:agenttalkie:build-checkpoint",
          sourceObservedAt: "2026-09-12T19:00:00Z", retrievedAt: new Date().toISOString() }],
      },
    };
  },
};
