// Provider observations only. Backend owns ledger identity, ordering and replay.
export type NativeReceipt = {
  provider: "exa" | "ambiguous" | "ori";
  observedAt: string;
  state: "completed" | "observed" | "interrupted" | "failed";
  providerRef?: string;
  sources?: { title: string; url: string }[];
  usage?: Record<string, number>;
  costDollars?: number;
  details: Record<string, string | number | boolean>;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 500) : undefined;
}
function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
export function safeProviderUrl(value: unknown, hosts: readonly string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !hosts.includes(url.hostname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function normalizeExaContext(value: unknown, observedAt: string, sourceHosts: readonly string[]): NativeReceipt {
  const data = record(value);
  if (!text(data.requestId) || typeof data.response !== "string") throw new Error("Missing Exa Context request or response");
  const sources: { title: string; url: string }[] = [];
  for (const match of data.response.matchAll(/^## ([^\n]+)\n(https:\/\/[^\s]+)\s*$/gm)) {
    const url = safeProviderUrl(match[2], sourceHosts);
    if (url && !sources.some(source => source.url === url)) sources.push({ title: match[1].slice(0, 200), url });
    if (sources.length === 3) break;
  }
  let cost: unknown = data.costDollars;
  if (typeof cost === "string") { try { cost = JSON.parse(cost); } catch { cost = undefined; } }
  const usage: Record<string, number> = {};
  for (const key of ["outputTokens", "resultsCount", "searchTime"]) {
    const n = number(data[key]); if (n !== undefined) usage[key] = n;
  }
  return { provider: "exa", state: "completed", observedAt, providerRef: text(data.requestId), sources,
    usage, costDollars: number(record(cost).total), details: { endpoint: "https://api.exa.ai/context" } };
}

export function normalizeAmbiguousTask(value: unknown, observedAt: string): NativeReceipt {
  const data = record(value);
  if (!text(data.id)) throw new Error("Missing Ambiguous task identity");
  const details: NativeReceipt["details"] = {};
  for (const key of ["title", "status", "task_key", "workspace_id", "updated_at"]) {
    const v = text(data[key]); if (v) details[key] = v;
  }
  const url = safeProviderUrl(data.url, ["app.ambiguous.ai"]);
  if (url) details.safeUrl = url;
  return { provider: "ambiguous", state: "observed", observedAt, providerRef: text(data.id), details };
}

export function normalizeOriEvents(events: unknown[], observedAt: string, exitState: "interrupted" | "failed"): NativeReceipt {
  let providerRef: string | undefined;
  let completed = false;
  let failed = false;
  let usage: Record<string, number> | undefined;
  for (const value of events) {
    const event = record(value);
    if (event.type === "thread.started") providerRef = text(event.thread_id);
    if (event.type === "turn.failed") failed = true;
    if (event.type === "turn.completed") {
      completed = true;
      usage = {};
      for (const key of ["input_tokens", "cached_input_tokens", "output_tokens"]) {
        const n = number(record(event.usage)[key]); if (n !== undefined) usage[key] = n;
      }
    }
  }
  return { provider: "ori", state: failed ? "failed" : completed ? "completed" : exitState,
    providerRef, observedAt, usage, details: { harness: "codex" } };
}
