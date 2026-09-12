"use client";

import { useState } from "react";
import type { WorkerResult } from "@/lib/agenttalkie-contract";
import { agenttalkieFixtureRequest } from "@/lib/agenttalkie-fixture";
import { safeSourceUrl, sameTarget } from "@/lib/client/agenttalkie-state";
import { useAgentTalkie } from "./provider";
import { Icon } from "./icons";

const evidenceLabels = { worker_reply: "Worker reply", source_read: "Source read", checkpoint: "Checkpoint", fixture: "Fixture" } as const;
function displayTime(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copied = !!followup && copiedKey === `${followup.requestId}:${followup.revision}`;
  const history = snapshot.session.requests.filter((request) => sameTarget(request, target));
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
      <p className="at-eyebrow">Projects</p>
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
      <div className="at-rail-note"><p>Work stays in focus.<br />The conversation stays with you.</p></div>
    </aside>

    <main className="at-main" id="main-content">
      <header className="at-heading"><div>
        <p className="at-eyebrow">{target.projectName}</p>
        <h1>Let's move the work forward.</h1>
        <p className="at-heading-description">Pick up the thread. Find the blocker. Decide what happens next.</p>
      </div></header>
      <div className="at-worker-context">
        <label htmlFor="at-worker">Working with</label>
        <select id="at-worker" value={snapshot.targets.findIndex((agent) => sameTarget(agent, target))}
          onChange={(event) => { const next = snapshot.targets[Number(event.target.value)]; if (next) { workspace.selectTarget(next); setView("work"); } }}>
          {snapshot.targets.map((agent, index) => <option key={`${agent.projectId}:${agent.agentId}:${agent.workerSessionId}`} value={index}>{agent.agentName}{agent.availability === "unavailable" ? " · Unavailable" : ""}</option>)}
        </select>
        <span className="at-context-caption">{currentRequest ? `Question ${currentRequest.revision}` : "One focused conversation"}</span>
      </div>
      <nav className="at-tabs" aria-label="Workspace view">
        <button className="at-tab" aria-pressed={view === "work"} onClick={() => setView("work")}><Icon name="work" size={15} /> Current work</button>
        <button className="at-tab" aria-pressed={view === "history"} onClick={() => setView("history")}><Icon name="history" size={15} /> Conversation history <span className="at-tab-count">{history.length}</span></button>
      </nav>
      <section className="at-stage" aria-label={view === "work" ? "Current work" : "Conversation history"}>
        {workspace.error && <div className="at-notice" role="alert">{workspace.error}{workspace.retry && <button className="at-button" style={{ marginLeft: 12 }} onClick={() => void workspace.retry?.()} disabled={submitting}>Retry same request</button>}{!ready && !loading && <button className="at-button" style={{ marginLeft: 12 }} onClick={() => void workspace.start()}>Reconnect workspace</button>}</div>}
        {!ready && <p className="at-notice">{snapshot.session.status === "ended" ? "Conversation ended. Your questions and answers remain here for review." : loading ? "Opening the workspace. The evidence below is a fixture preview." : "The workspace is disconnected. Reconnect to ask a question."}</p>}
        {view === "history" ? <>
          <p className="at-eyebrow">Questions and their source records</p>
          {history.length === 0 ? <p className="at-empty">Your questions and answers will appear here. Corrections keep earlier answers in this history.</p> : <ol className="at-history">{[...history].reverse().map((request) => <li key={`${request.requestId}:${request.revision}`}>
            <div className="at-history-label"><span>Revision {request.revision}</span><span>·</span><span>{request.state === "superseded" ? "Earlier question" : request.state}</span><span>{displayTime(request.updatedAt)}</span></div>
            <h3>{request.question}</h3>
            {request.result ? <><p>{request.result.answer}</p><EvidenceDetails result={request.result} /></> : <p>{request.error?.message ?? (request.state === "superseded" ? "An earlier request. Any later answer will stay here." : "Waiting for a result.")}</p>}
          </li>)}</ol>}
        </> : <>
          {target.availability === "unavailable" && <div className="at-state"><Icon name="alert" /><div><p><strong>{target.agentName} is unavailable</strong></p><p>{target.unavailableReason ?? "This worker cannot be reached right now."}</p></div></div>}
          {!currentRequest ? <div className="at-intro"><h2>What should we look into?</h2><p>Ask about this agent's work. Review the answer with its source, then narrow the question as you go.</p>
            <button className="at-prompt" disabled={!available || submitting} onClick={() => void workspace.sendQuestion(agenttalkieFixtureRequest.question)}><span>{agenttalkieFixtureRequest.question}</span><Icon name="arrow" /></button>
            <button className="at-prompt" disabled={!available || submitting} onClick={() => void workspace.sendQuestion("Which part of the voice connection still needs verification?")}><span>What still needs verification?</span><Icon name="arrow" /></button>
          </div> : <>
            <div className="at-request"><span className="at-person">You</span><div><small>YOUR QUESTION · REVISION {currentRequest.revision}</small><p>{currentRequest.question}</p></div></div>
            {currentRequest.state === "pending" && <div className="at-state" role="status"><Icon name="history" /><div><p>{submitting ? "Submitting your question…" : "Waiting for the agent's answer…"}</p><p>You can correct the question while this request is pending.</p></div></div>}
            {(currentRequest.state === "failed" || currentRequest.state === "unavailable") && <div className="at-state" role="status"><Icon name="alert" /><div><p>{currentRequest.state === "unavailable" ? "The agent is unavailable." : "The request did not complete."}</p><p>{currentRequest.error?.message ?? "No answer was returned."}</p></div></div>}
            {answer && <article className="at-response"><div className="at-response-header"><span className="at-agent-monogram" style={{ width: 28, height: 28, fontSize: 16 }}>{target.agentName.slice(0, 1)}</span><strong>{target.agentName}</strong><span className="at-result-caption">Finding received</span></div>
              <h2 className="at-finding-title">The latest finding</h2><p className="at-answer">{answer.answer}</p><EvidenceDetails result={answer} />
              <div className="at-actions"><button className="at-button at-button-primary" disabled={!available || submitting || preparing} onClick={() => { setCopiedKey(null); void workspace.prepare(); }}>{preparing ? "Preparing…" : "Prepare follow-up"}<Icon name="arrow" size={14} /></button><button className="at-button" onClick={() => setView("history")}>View history</button></div>
            </article>}
            {followup && <section className="at-followup" aria-label="Prepared follow-up"><p className="at-eyebrow">Prepared · Not sent</p><h3>A next step for {followup.recipient}</h3>
              <dl className="at-facts"><div><dt>Recipient session</dt><dd><code>{followup.workerSessionId}</code></dd></div><div><dt>Question revision</dt><dd>{followup.revision}</dd></div></dl><p>{followup.scope}</p>
              <div className="at-actions"><button className="at-button" onClick={() => void copyFollowup()}><Icon name={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy follow-up"}</button></div>
            </section>}
          </>}
        </>}
      </section>
    </main>
  </div>;
}
