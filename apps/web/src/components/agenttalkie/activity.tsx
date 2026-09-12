"use client";

import { useEffect, useMemo, useState } from "react";
import { activityLedgerSchema, orderActivityEvents, type ActivityEvent } from "@/lib/agenttalkie-activity";
import type { RequestRecord } from "@/lib/agenttalkie-contract";
import { useAgentTalkie } from "./provider";
import { Icon } from "./icons";

const providerNames = { agenttalkie: "AgentTalkie", ambiguous: "Ambiguous", exa: "Exa Code Context", ori: "Ori / OpenRouter" } as const;

function displayTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
}

function detailLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function fixtureEvent(request: RequestRecord | null): ActivityEvent | null {
  if (!request) return null;
  const state = request.state === "unavailable" ? "failed" : request.state;
  return {
    eventId: `fixture:${request.requestId}:${request.revision}:${request.state}`,
    operationId: `fixture:${request.requestId}`,
    requestId: request.requestId,
    revision: request.revision,
    provider: "agenttalkie",
    kind: request.state === "completed" ? "source_returned" : request.state === "failed" || request.state === "unavailable" ? "failure" : "accepted_command",
    state,
    label: request.state === "completed" ? "Fixture answer returned in this browser tab" : `Fixture question is ${request.state}`,
    observedAt: request.updatedAt || new Date(0).toISOString(),
    evidenceMode: "fixture",
    details: { question: request.question },
  };
}

export function ActivityDrawer({ open, onClose, currentRequest }: { open: boolean; onClose: () => void; currentRequest: RequestRecord | null }) {
  const workspace = useAgentTalkie();
  const live=workspace.snapshot.session.mode==="live";
  const sessionId=workspace.snapshot.session.id;
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setEvents([]); setLoading(true); setError(null);
    const refresh = () => fetch(live ? `/api/agenttalkie/live/activity?sessionId=${sessionId}` : "/api/agenttalkie/activity", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Activity evidence could not be loaded.");
        return activityLedgerSchema.parse(body);
      })
      .then((ledger) => { if (!controller.signal.aborted) {setEvents(ledger.events);setError(null);} })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity evidence could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void refresh();
    const timer=live?setInterval(()=>void refresh(),1500):undefined;
    return () => {controller.abort();clearInterval(timer);};
  }, [open, live, sessionId]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  const rows = useMemo(() => {
    const fixture = live ? null : fixtureEvent(currentRequest);
    return orderActivityEvents(fixture ? [...events, fixture] : events).reverse();
  }, [events, currentRequest, live]);

  if (!open) return null;
  return <div className="at-activity-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="at-activity" id="at-activity-panel" role="dialog" aria-modal="true" aria-labelledby="at-activity-title">
      <header className="at-activity-header">
        <div><p className="at-eyebrow">Observed work</p><h2 id="at-activity-title">Activity</h2></div>
        <button className="at-icon-button" onClick={onClose} aria-label="Close activity"><span aria-hidden="true">×</span></button>
      </header>
      <p className="at-activity-intro">Provider receipts and fixture events stay separate. Partial work remains visible.</p>
      {loading && <p className="at-notice" role="status">Loading activity evidence…</p>}
      {error && <p className="at-notice" role="alert">{error}</p>}
      <ol className="at-activity-list">
        {rows.map((event) => <li key={event.eventId} className="at-activity-row">
          <div className="at-activity-row-head">
            <span className={`at-activity-state at-activity-state-${event.state}`}>{event.state}</span>
            <span className={`at-activity-evidence at-activity-evidence-${event.evidenceMode}`}>{event.evidenceMode}</span>
            <time dateTime={event.observedAt}>{displayTime(event.observedAt)}</time>
          </div>
          <p className="at-activity-provider">{providerNames[event.provider]}</p>
          <h3>{event.label}</h3>
          <details>
            <summary>Receipt details <Icon name="chevron" size={14} /></summary>
            <dl className="at-activity-facts">
              <div><dt>Operation</dt><dd><code>{event.operationId}</code></dd></div>
              <div><dt>Request</dt><dd><code>{event.requestId}</code></dd></div>
              <div><dt>Revision</dt><dd>{event.revision}</dd></div>
              {event.providerRef && <div><dt>Provider reference</dt><dd><code>{event.providerRef}</code></dd></div>}
              {Object.entries(event.details).map(([key, value]) => <div key={key}><dt>{detailLabel(key)}</dt><dd>{String(value)}</dd></div>)}
            </dl>
            {event.safeUrl && <p><a href={event.safeUrl} target="_blank" rel="noopener noreferrer">Open original</a></p>}
            {event.sources?.map((source) => <p className="at-activity-source" key={source.safeUrl}><a href={source.safeUrl} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}
          </details>
        </li>)}
      </ol>
    </aside>
  </div>;
}
