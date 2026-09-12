import { ACTIVITY_CONTRACT_VERSION, activityLedgerSchema, orderActivityEvents, type ActivityEvent, type ActivityLedger } from "@/lib/agenttalkie-activity";

const operationId = "historical-provider-proof-20260912";
const requestId = "historical-provider-evidence";

const exa: ActivityEvent = {
  eventId: "exa:26ff394d654cb8c6c8139d1748c007cb:completed", operationId, requestId, revision: 1,
  provider: "exa", kind: "source_returned", state: "completed",
  label: "Exa Code Context returned 10 sources",
  observedAt: "2026-09-12T20:47:50.894Z", evidenceMode: "live", providerRef: "26ff394d654cb8c6c8139d1748c007cb",
  sources: [
    { title: "Synchronizing with Effects", safeUrl: "https://react.dev/learn/synchronizing-with-effects" },
    { title: "useEffect", safeUrl: "https://react.dev/reference/react/useEffect" },
    { title: "Removing Effect Dependencies", safeUrl: "https://react.dev/learn/removing-effect-dependencies" },
  ],
  details: {
    query: "React useEffect AbortController fetch cleanup official documentation examples",
    outputTokens: 2494,
    resultsCount: 10,
    searchTimeMs: 1006,
    costDollars: 0.007,
    endpoint: "https://api.exa.ai/context",
  },
};

const ori: ActivityEvent = {
  eventId: "ori:interrupted-demo-run", operationId, requestId, revision: 1,
  provider: "ori", kind: "worker_start", state: "interrupted",
  label: "Ori Codex job was interrupted before a terminal result",
  observedAt: "2026-09-12T20:50:24.717Z", evidenceMode: "live",
  details: {
    harness: "codex",
    requestedModel: "openai/gpt-5.4-mini",
    actualModelConfirmed: false,
    artifactReturned: false,
  },
};

const ambiguous: ActivityEvent = {
  eventId: "ambiguous:demo-task-readback", operationId, requestId: "historical-ambiguous-demo", revision: 1,
  provider: "ambiguous", kind: "readback", state: "completed",
  label: "Demo task created and read back",
  observedAt: "2026-09-12T21:07:57.000Z", evidenceMode: "live",
  details: {
    createCount: 1,
    readbackCount: 1,
    providerUrlReturned: false,
    historicalObservation: true,
  },
};

export function activityProofLedger(): ActivityLedger {
  const events = orderActivityEvents([exa, ori, ambiguous]);
  return activityLedgerSchema.parse({
    contractVersion: ACTIVITY_CONTRACT_VERSION,
    cursor: events.at(-1)?.eventId ?? "activity-empty",
    events,
  });
}
