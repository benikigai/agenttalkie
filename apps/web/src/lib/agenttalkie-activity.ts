import { z } from "zod";

export const ACTIVITY_CONTRACT_VERSION = "AT-activity-0.1" as const;
const SAFE_ACTIVITY_HOSTS = new Set(["app.ambiguous.ai", "docs.exa.ai", "github.com", "openrouter.ai", "react.dev"]);

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && SAFE_ACTIVITY_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

const activitySourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  safeUrl: z.string().url().refine(isSafeHttpsUrl, "Source URLs must be credential-free HTTPS URLs"),
}).strict();

export const activityEventSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  operationId: z.string().trim().min(1).max(160),
  requestId: z.string().trim().min(1).max(160),
  revision: z.number().int().positive(),
  provider: z.enum(["agenttalkie", "ambiguous", "exa", "ori"]),
  kind: z.enum(["accepted_command", "provider_request", "worker_start", "source_returned", "proposed_action", "approval", "write_attempt", "readback", "failure"]),
  state: z.enum(["accepted", "pending", "running", "completed", "partial", "interrupted", "failed", "blocked", "superseded"]),
  label: z.string().trim().min(1).max(240),
  observedAt: z.string().datetime(),
  evidenceMode: z.enum(["live", "fixture"]),
  providerRef: z.string().trim().min(1).max(500).optional(),
  safeUrl: z.string().url().refine(isSafeHttpsUrl, "Provider URLs must be credential-free HTTPS URLs").optional(),
  sources: z.array(activitySourceSchema).max(3).optional(),
  details: z.record(z.string().max(80), z.union([z.string().max(500), z.number().finite(), z.boolean()])).refine((value) => Object.keys(value).length <= 12, "Activity details are limited to 12 fields"),
}).strict();

export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const activityLedgerSchema = z.object({
  contractVersion: z.literal(ACTIVITY_CONTRACT_VERSION),
  cursor: z.string().trim().min(1).max(160),
  events: z.array(activityEventSchema).max(100),
}).strict();

export type ActivityLedger = z.infer<typeof activityLedgerSchema>;

export function orderActivityEvents(values: readonly ActivityEvent[]): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();
  for (const value of values) {
    const event = activityEventSchema.parse(value);
    const existing = byId.get(event.eventId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
      throw new Error(`Activity event collision: ${event.eventId}`);
    }
    byId.set(event.eventId, event);
  }
  return [...byId.values()].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) || left.eventId.localeCompare(right.eventId));
}
