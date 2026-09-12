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
      {[...latest.values()].map((event) => <li className="at-evidence-item" key={event.eventId}>
        <span className={`at-evidence-dot at-evidence-${event.state}`} aria-hidden="true" />
        <span className="at-evidence-provider">{providerNames[event.provider]}</span>
        <span className="at-evidence-title">{event.label}</span>
        <span className="at-evidence-meta">{event.state}<span className="at-provenance-sep"> · </span>{shortTime(event.observedAt)}</span>
        {event.providerRef && <code className="at-evidence-ref">{event.providerRef.slice(0, 12)}</code>}
      </li>)}
    </ul>
  </section>;
}
