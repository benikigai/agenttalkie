"use client";

import { useState } from "react";
import type { WorkerResult } from "@/lib/agenttalkie-contract";
import { safeSourceUrl, sameTarget } from "@/lib/client/agenttalkie-state";
import { useAgentTalkie } from "./provider";
import { Icon } from "./icons";
import { ActivityDrawer } from "./activity";
import { LiveEvidence } from "./live-evidence";
import { ToolsStatus } from "./tools-status";

/** Things this agent can actually do today, phrased so they can be spoken. */
const STARTER_PROMPTS = [
  { label: "Show my Ambiguous tasks", tool: "Tasks", send: "Show my Ambiguous tasks and tell me which one needs a decision." },
  { label: "Draft a document in Ambiguous", tool: "Tasks", send: "Draft a document in Ambiguous for me to review before anything is saved." },
  { label: "Research this and cite the sources", tool: "Research", send: "Research this with Exa and show me the sources you used." },
  { label: "What is blocking the selected task?", tool: "Tasks", send: "Read the selected task and tell me what is blocking it." },
] as const;

const evidenceLabels = { worker_reply: "Worker reply", source_read: "Source read", checkpoint: "Checkpoint", fixture: "Fixture" } as const;
function displayTime(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

/** The finding is the headline: first sentence up top, the rest as body. */
function splitFinding(answer: string) {
  // The evidence chip and the mode pill already state that a result is a fixture.
  // Repeating the label inside the headline reads as placeholder text on camera.
  const text = answer.trim().replace(/^fixture\s*[:\u2014-]\s*/i, "");
  const match = text.match(/^(.+?[.!?])(\s+)([\s\S]+)$/);
  if (!match || match[1].length > 110) return { headline: text.length > 110 ? text.slice(0, 107).trimEnd() + "…" : text, body: match ? text.slice(match[1].length).trim() : "" };
  return { headline: match[1], body: match[3] };
}

export function ProvenanceStrip({ result, agentName }: { result: WorkerResult; agentName: string }) {
  const primary = result.evidence[0];
  return <p className="at-provenance">
    <strong>{agentName}</strong>
    <span className="at-provenance-sep">·</span>
    <span>{evidenceLabels[primary.kind]}</span>
    <span className="at-provenance-sep">·</span>
    <span>observed {displayTime(primary.sourceObservedAt)}</span>
    <span className="at-provenance-sep">·</span>
    <span>revision {result.revision}</span>
    <code>{result.workerSessionId}</code>
  </p>;
}

export function EvidenceDetails({ result }: { result: WorkerResult }) {
  return <details className="at-source-details">
    <summary><Icon name="source" size={16} /> Sources &amp; session <span className="at-tab-count">{result.evidence.length}</span><Icon name="chevron" size={14} className="at-chevron" /></summary>
    <dl className="at-facts">
      <div><dt>Worker session</dt><dd><code>{result.workerSessionId}</code></dd></div>
      <div><dt>Question</dt><dd>Revision {result.revision} <code>{result.requestId}</code></dd></div>
    </dl>
    {result.evidence.map((source, index) => {
      const url = safeSourceUrl(source.reference);
      return <div className="at-source" key={`${source.reference}-${index}`}>
        <span className="at-mode">{evidenceLabels[source.kind]}</span>
        <p style={{ marginTop: 9 }}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.reference}</a> : <code>{source.reference}</code>}</p>
        <dl className="at-facts">
          <div><dt>Source observed</dt><dd>{displayTime(source.sourceObservedAt)}</dd></div>
          <div><dt>Retrieved</dt><dd>{displayTime(source.retrievedAt)}</dd></div>
        </dl>
      </div>;
    })}
  </details>;
}

export function AgentTalkieWorkspace() {
  const workspace = useAgentTalkie();
  const { snapshot, target, ready, loading, answer, currentRequest, followup, submitting, preparing } = workspace;
  const [view, setView] = useState<"work" | "history">("work");
  const [activityOpen, setActivityOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copied = !!followup && copiedKey === `${followup.requestId}:${followup.revision}`;
  const history = snapshot.session.requests.filter((request) => sameTarget(request, target));
  const finding = splitFinding(answer?.answer ?? "");
  const available = ready && snapshot.session.status === "active";

  const copyFollowup = async () => {
    if (!followup) return;
    try {
      await navigator.clipboard.writeText(`To: ${followup.recipient}\nSession: ${followup.workerSessionId}\nQuestion revision: ${followup.revision}\n\n${followup.scope}`);
      setCopiedKey(`${followup.requestId}:${followup.revision}`);
    } catch { setCopiedKey(null); }
  };

  return <div className="at-grid">
    <aside className="at-rail" aria-label="Projects">
      <p className="at-eyebrow">Workspace</p>
      <div className="at-project-list">
        {[...new Map(snapshot.targets.map((agent) => [agent.projectId, agent])).values()].map((project) =>
          <button className="at-project" key={project.projectId} aria-pressed={project.projectId === target.projectId}
            onClick={() => {
              if (project.projectId !== target.projectId) workspace.selectTarget(snapshot.targets.find((agent) => agent.projectId === project.projectId && agent.availability !== "unavailable") ?? project);
              setView("work");
            }}>
            <Icon name="work" size={17} /><span>{project.projectName}</span>
          </button>)}
      </div>
      <p className="at-eyebrow" style={{ marginTop: 22 }}>Agents you can talk to</p>
      <div className="at-agent-list">
        {snapshot.targets.filter((agent) => agent.projectId === target.projectId).map((agent) =>
          <button className="at-agent" key={`${agent.agentId}:${agent.workerSessionId}`} aria-pressed={sameTarget(agent, target)}
            onClick={() => { workspace.selectTarget(agent); setView("work"); }}>
            <span className="at-agent-monogram">{agent.agentName.slice(0, 1)}</span>
            <span style={{ minWidth: 0 }}>
              <strong>{agent.agentName}</strong>
              <small className={`at-agent-status at-agent-status-${agent.availability}`}><span className="at-dot" />{agent.availability === "unavailable" ? "Unavailable" : "Ready"}</small>
            </span>
          </button>)}
      </div>
      <ToolsStatus />
    </aside>

    <main className="at-main" id="main-content">
      <header className="at-heading"><div>
        <p className="at-eyebrow">{answer ? `${target.agentName} · ${target.projectName}` : target.projectName}</p>
        <h1>{answer ? finding.headline : "What needs you right now?"}</h1>
        {answer
          ? <ProvenanceStrip result={answer} agentName={target.agentName} />
          : <p className="at-heading-description">One conversation across every agent you run, with the receipt behind every action.</p>}
      </div></header>
      <div className="at-worker-context">
        <span className="at-mode"><span className="at-dot" />{target.availability === "unavailable" ? `${target.agentName} unavailable` : `Talking with ${target.agentName}`}</span>
        {currentRequest && <span className="at-context-caption">Question {currentRequest.revision}</span>}
      </div>
      <nav className="at-tabs" aria-label="Workspace view">
        <button className="at-tab" aria-pressed={view === "work"} onClick={() => setView("work")}><Icon name="work" size={15} /> Current work</button>
        <button className="at-tab" aria-pressed={view === "history"} onClick={() => setView("history")}><Icon name="history" size={15} /> Conversation history <span className="at-tab-count">{history.length}</span></button>
        <button className="at-tab" aria-expanded={activityOpen} aria-controls="at-activity-panel" onClick={() => setActivityOpen(true)}><Icon name="source" size={15} /> Activity</button>
      </nav>
      <LiveEvidence onInspect={() => setActivityOpen(true)} />
      <section className="at-stage" aria-label={view === "work" ? "Current work" : "Conversation history"}>
        {workspace.error && <div className="at-notice at-notice-alert" role="alert">{workspace.error}{workspace.retry && <button className="at-button" style={{ marginLeft: 12 }} onClick={() => void workspace.retry?.()} disabled={submitting}>Retry same request</button>}{!ready && !loading && <button className="at-button" style={{ marginLeft: 12 }} onClick={() => void workspace.start()}>Reconnect workspace</button>}</div>}
        {!ready && <p className={`at-notice${loading ? " at-notice-working" : ""}${snapshot.session.status === "ended" || loading ? "" : " at-notice-alert"}`} role="status">{snapshot.session.status === "ended" ? "Conversation ended. Your questions and answers remain here for review." : loading ? "Opening the workspace. The evidence below is a fixture preview." : "The workspace is disconnected. Reconnect to ask a question."}</p>}
        {view === "history" ? <>
          <p className="at-eyebrow">Questions and their source records</p>
          {history.length === 0 ? <p className="at-empty">Your questions and answers will appear here. Corrections keep earlier answers in this history.</p> : <ol className="at-history">{[...history].reverse().map((request) => <li key={`${request.requestId}:${request.revision}`}>
            <div className="at-history-label"><span>Revision {request.revision}</span><span>·</span><span>{request.state === "superseded" ? "Earlier question" : request.state}</span><span>{displayTime(request.updatedAt)}</span></div>
            <h3>{request.question}</h3>
            {request.result ? <><p>{request.result.answer}</p><EvidenceDetails result={request.result} /></> : <p>{request.error?.message ?? (request.state === "superseded" ? "An earlier request. Any later answer will stay here." : "Waiting for a result.")}</p>}
          </li>)}</ol>}
        </> : <>
          {target.availability === "unavailable" && <div className="at-state"><Icon name="alert" /><div><p><strong>{target.agentName} is unavailable</strong></p><p>{target.unavailableReason ?? "This worker cannot be reached right now."}</p></div></div>}
          {!currentRequest ? <div className="at-intro"><h2>Start here</h2><p>Ask about this agent's work, then narrow the question as you go. Corrections keep the earlier answer in history.</p>
            {STARTER_PROMPTS.map((prompt) => <button className="at-prompt" key={prompt.send} disabled={!available || submitting} onClick={() => void workspace.sendQuestion(prompt.send)}>
              <span><span className="at-prompt-label">{prompt.label}</span><span className="at-prompt-tool">{prompt.tool}</span></span><Icon name="arrow" />
            </button>)}
          </div> : <>
            <div className="at-request"><span className="at-person">You</span><div><small>YOUR QUESTION · REVISION {currentRequest.revision}</small><p>{currentRequest.question}</p></div></div>
            {currentRequest.state === "pending" && <div className="at-state at-state-working" role="status"><div><p>{submitting ? "Submitting your question" : "Working on your question"}<span className="at-working-dots" /></p><p>You can correct the question while this request is pending.</p></div></div>}
            {(currentRequest.state === "failed" || currentRequest.state === "unavailable") && <div className="at-state" role="status"><Icon name="alert" /><div><p>{currentRequest.state === "unavailable" ? "The agent is unavailable." : "The request did not complete."}</p><p>{currentRequest.error?.message ?? "No answer was returned."}</p></div></div>}
            {answer && <article className="at-response"><div className="at-response-header"><span className="at-agent-monogram" style={{ width: 28, height: 28, fontSize: 16 }}>{target.agentName.slice(0, 1)}</span><strong>{target.agentName}</strong><span className="at-result-caption">Finding received</span></div>
              <p className="at-answer">{finding.body || answer.answer}</p><EvidenceDetails result={answer} />
              <div className="at-actions"><button className="at-button at-button-primary" disabled={!available || submitting || preparing} onClick={() => { setCopiedKey(null); void workspace.prepare(); }}>{preparing ? "Preparing…" : "Prepare follow-up"}<Icon name="arrow" size={14} /></button><button className="at-button" onClick={() => setView("history")}>View history</button></div>
            </article>}
            {followup && <section className="at-followup" aria-label="Prepared follow-up"><p className="at-eyebrow">Prepared · Not sent</p><h3>A next step for {followup.recipient}</h3>
              <dl className="at-facts"><div><dt>Recipient session</dt><dd><code>{followup.workerSessionId}</code></dd></div><div><dt>Question revision</dt><dd>{followup.revision}</dd></div></dl><p>{followup.scope}</p>
              <div className="at-actions"><button className="at-button" onClick={() => void copyFollowup()}><Icon name={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy follow-up"}</button></div>
            </section>}
          </>}
        </>}
      </section>
      <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)} currentRequest={currentRequest} />
    </main>
  </div>;
}
