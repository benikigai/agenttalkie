"use client";

/**
 * Live provider evidence, surfaced in the workspace rather than behind the drawer.
 *
 * The workspace conversation runs on fixture data until a real worker adapter
 * registers a live target, so the mode pill reads "Fixture". That is accurate,
 * but it buries the provider work that is genuinely live: an Exa retrieval and
 * an Ambiguous task that was created and read back. Those carry provider
 * references and belong in front of the reader, not one click away.
 *
 * Reads the same ledger the drawer reads. Renders nothing when no live event
 * exists, so it never manufactures reassurance.
 */
import { useEffect, useState } from "react";
import { activityLedgerSchema, orderActivityEvents, type ActivityEvent } from "@/lib/agenttalkie-activity";
import { Icon } from "./icons";

const providerNames = {
  agenttalkie: "AgentTalkie",
  ambiguous: "Ambiguous AI",
  exa: "Exa",
  ori: "Ori / OpenRouter",
} as const;

function shortTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function LiveEvidence({ onInspect }: { onInspect(): void }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agenttalkie/activity", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!body) return;
        const ledger = activityLedgerSchema.safeParse(body);
        if (!ledger.success) return;
        setEvents(orderActivityEvents(ledger.data.events).reverse().filter((event) => event.evidenceMode === "live"));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (events.length === 0) return null;

  // One row per provider, keeping its most recent live event.
  const latest = new Map<string, ActivityEvent>();
  for (const event of events) if (!latest.has(event.provider)) latest.set(event.provider, event);

  return <section className="at-evidence" aria-label="Live provider evidence">
    <div className="at-evidence-head">
      <p className="at-eyebrow">Verified provider work</p>
      <button className="at-evidence-link" onClick={onInspect}>Inspect receipts <Icon name="arrow" size={13} /></button>
    </div>
    <ul className="at-evidence-list">
      {[...latest.values()].map((event) => {
        const detail = event.details ?? {};
        const facts = ["query", "resultsCount", "searchTimeMs", "costDollars", "endpoint"]
          .filter((key) => detail[key] !== undefined)
          .map((key) => [key, detail[key]] as const);
        const expandable = facts.length > 0 || (event.sources?.length ?? 0) > 0 || !!event.safeUrl;
        const head = <>
          <span className={`at-evidence-dot at-evidence-${event.state}`} aria-hidden="true" />
          <span className="at-evidence-provider">{providerNames[event.provider]}</span>
          <span className="at-evidence-title">{event.label}</span>
          <span className="at-evidence-meta">{event.state}<span className="at-provenance-sep"> · </span>{shortTime(event.observedAt)}</span>
          {event.providerRef && <code className="at-evidence-ref">{event.providerRef.slice(0, 12)}</code>}
        </>;
        if (!expandable) return <li className="at-evidence-item" key={event.eventId}>{head}</li>;
        return <li key={event.eventId}>
          <details className="at-evidence-details">
            <summary className="at-evidence-item">{head}<Icon name="chevron" size={14} className="at-chevron" /></summary>
            <div className="at-evidence-body">
              {facts.length > 0 && <dl className="at-evidence-facts">
                {facts.map(([key, value]) => <div key={key}>
                  <dt>{key === "resultsCount" ? "Results" : key === "searchTimeMs" ? "Search time" : key === "costDollars" ? "Cost" : key === "endpoint" ? "Endpoint" : "Query"}</dt>
                  <dd>{key === "searchTimeMs" ? `${Math.round(Number(value))} ms` : key === "costDollars" ? `$${value}` : String(value)}</dd>
                </div>)}
              </dl>}
              {event.safeUrl && <p className="at-evidence-open"><a href={event.safeUrl} target="_blank" rel="noopener noreferrer">Open the provider record <Icon name="arrow" size={13} /></a></p>}
              {(event.sources?.length ?? 0) > 0 && <ul className="at-evidence-sources">
                {event.sources!.map((source) => <li key={source.safeUrl}>
                  <a href={source.safeUrl} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  <span>{new URL(source.safeUrl).hostname}</span>
                </li>)}
              </ul>}
            </div>
          </details>
        </li>;
      })}
    </ul>
  </section>;
}
