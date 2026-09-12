"use client";

import { useEffect, useState } from "react";
import { activityLedgerSchema, orderActivityEvents, type ActivityEvent } from "@/lib/agenttalkie-activity";
import { Icon } from "./icons";
import { useAgentTalkie } from "./provider";

/** What the event actually did, in the user's language. */
const actionVerbs: Record<string, string> = {
  accepted_command: "Accepted",
  provider_request: "Called",
  worker_start: "Started worker",
  source_returned: "Researched",
  proposed_action: "Proposed",
  approval: "Approved",
  write_attempt: "Writing",
  readback: "Verified",
  failure: "Failed",
};

const providerNames = {
  agenttalkie: "AgentTalkie",
  ambiguous: "Ambiguous AI",
  exa: "Exa",
  ori: "Ori / OpenRouter",
} as const;

const FACT_LABELS: Record<string, string> = {
  created: "Created", workspace: "Workspace", identity: "Acting as", verifiedBy: "Verified by",
  query: "Query", resultsCount: "Results", searchTimeMs: "Search time", costDollars: "Cost",
  endpoint: "Endpoint", providerUrlReturned: "Provider returned a URL", harness: "Harness",
  requestedModel: "Requested model", actualModelConfirmed: "Model confirmed",
  artifactReturned: "Artifact returned", createCount: "Creates", readbackCount: "Read-backs",
};

/** Turn a camelCase key into a readable label when it has no explicit name. */
function factLabel(key: string) {
  return FACT_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function shortTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function LiveEvidence({ onInspect }: { onInspect(): void }) {
  const {snapshot,currentRequest}=useAgentTalkie();
  const live=snapshot.session.mode==="live";
  const sessionId=snapshot.session.id;
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setEvents([]);
    setPreview(null);
    const refresh=()=>fetch(live?`/api/agenttalkie/live/activity?sessionId=${sessionId}`:"/api/agenttalkie/activity", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!body) return;
        const ledger = activityLedgerSchema.safeParse(body);
        if (!ledger.success || controller.signal.aborted) return;
        setEvents(orderActivityEvents(ledger.data.events).reverse().filter((event) => event.evidenceMode === "live"));
      })
      .catch(() => undefined);
    void refresh();
    const timer=live?setInterval(()=>void refresh(),1500):undefined;
    return () => {controller.abort();clearInterval(timer);};
  }, [live,sessionId]);

  if (events.length === 0) return null;

  const currentEvents = currentRequest
    ? events.filter(event => event.requestId === currentRequest.requestId && event.revision === currentRequest.revision)
    : events;
  const visible = (currentEvents.length ? currentEvents : events).slice(0, 6).reverse();

  return <section className="at-evidence" aria-label="Live provider evidence">
    <div className="at-evidence-head">
      <p className="at-eyebrow">Activity in this conversation</p>
      <button className="at-evidence-link" onClick={onInspect}>Inspect receipts <Icon name="arrow" size={13} /></button>
    </div>
    <ul className="at-evidence-list" aria-live="polite" aria-relevant="additions text">
      {visible.map((event) => {
        const detail = event.details ?? {};
        // Show whatever the provider reported, most descriptive first, rather
        // than a whitelist that silently drops fields a new provider adds.
        const order = ["created", "workspace", "identity", "verifiedBy", "query", "resultsCount", "searchTimeMs", "costDollars", "endpoint"];
        const facts = Object.entries(detail)
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .sort(([a], [b]) => {
            const ai = order.indexOf(a), bi = order.indexOf(b);
            return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.localeCompare(b);
          })
          .slice(0, 8);
        const expandable = facts.length > 0 || (event.sources?.length ?? 0) > 0 || !!event.safeUrl;
        const head = <>
          <span className={`at-evidence-dot at-evidence-${event.state}`} aria-hidden="true" />
          <span className={`at-evidence-verb at-evidence-${event.state}`}>{actionVerbs[event.kind] ?? event.kind}</span>
          <span className="at-evidence-provider">{providerNames[event.provider]}</span>
          <span className="at-evidence-title">{event.label}</span>
          <span className="at-evidence-meta">{shortTime(event.observedAt)}</span>
          {event.providerRef && <code className="at-evidence-ref">{event.providerRef.slice(0, 12)}</code>}
        </>;
        if (!expandable) return <li className="at-evidence-item" key={event.eventId}>{head}</li>;
        return <li key={event.eventId}>
          <details className="at-evidence-details">
            <summary className="at-evidence-item">{head}<Icon name="chevron" size={14} className="at-chevron" /></summary>
            <div className="at-evidence-body">
              {facts.length > 0 && <dl className="at-evidence-facts">
                {facts.map(([key, value]) => <div key={key}>
                  <dt>{factLabel(key)}</dt>
                  <dd>{key === "searchTimeMs" ? `${Math.round(Number(value))} ms` : key === "costDollars" ? `$${value}` : typeof value === "boolean" ? (value ? "yes" : "no") : String(value)}</dd>
                </div>)}
              </dl>}
              {event.safeUrl && <p className="at-evidence-open"><a href={event.safeUrl} target="_blank" rel="noopener noreferrer">Open the provider record <Icon name="arrow" size={13} /></a></p>}
              {(event.sources?.length ?? 0) > 0 && <ul className="at-evidence-sources">
                {event.sources!.map((source) => <li key={source.safeUrl}>
                  <a href={source.safeUrl} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  <span>{new URL(source.safeUrl).hostname}</span>
                  <button className="at-evidence-preview-btn" onClick={() => setPreview(preview?.url === source.safeUrl ? null : { title: source.title, url: source.safeUrl })}>
                    {preview?.url === source.safeUrl ? "Hide page" : "Show page"}
                  </button>
                </li>)}
              </ul>}
              {preview && event.sources?.some((source) => source.safeUrl === preview.url) && <figure className="at-evidence-preview">
                <figcaption>{preview.title}<a href={preview.url} target="_blank" rel="noopener noreferrer">Open in a new tab</a></figcaption>
                <iframe src={preview.url} title={`Live page: ${preview.title}`} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-popups" />
                <p className="at-evidence-preview-note">Loaded live from {new URL(preview.url).hostname}. Some sites refuse to be embedded; use the link if this stays blank.</p>
              </figure>}
            </div>
          </details>
        </li>;
      })}
    </ul>
  </section>;
}
