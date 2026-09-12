"use client";

import { useEffect, useRef, useState } from "react";
import { createLiveVoiceController, type LiveVoiceController, type LiveVoiceState, type TranscriptSnapshot } from "@/lib/voice/live-controller";
import { useAgentTalkie } from "./provider";
import { Icon } from "./icons";

export function VoiceDock() {
  const workspace = useAgentTalkie();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const controller = useRef<LiveVoiceController | null>(null);
  const [voice, setVoice] = useState<LiveVoiceState>({ status: "idle", muted: false, liveSessionId: null, playbackBlocked: false, closeConfirmed: false, error: null });
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSnapshot | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [delegationId, setDelegationId] = useState<string | null>(null);
  const [spokenRequest, setSpokenRequest] = useState<{ requestId: string; revision: number; delegationId: string } | null>(null);
  const composerRevision = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const transport = createLiveVoiceController({
      onState: setVoice,
      onTranscript: setTranscript,
      onError: setNotice,
      onDelegation: (event) => {
        composerRevision.current++;
        setDelegationId(event.delegationId);
        setText(event.inputText);
        setComposerOpen(true);
        setNotice("Review the captured words before asking the agent. Voice fragments may be incomplete.");
      },
    });
    controller.current = transport;
    return () => { controller.current = null; void transport.end(); };
  }, []);

  useEffect(() => { if (composerOpen) textarea.current?.focus(); }, [composerOpen]);

  useEffect(() => {
    const result = workspace.answer;
    const mapped = spokenRequest;
    if (!result || !mapped || result.requestId !== mapped.requestId || result.revision !== mapped.revision) return;
    if (voice.status !== "connected" || result.evidence.some((item) => item.kind === "fixture")) return;
    const request = workspace.currentRequest;
    if (!request) return;
    const content = `${workspace.target.agentName}: ${result.answer}`;
    // A bounded excerpt keeps the full evidence in the workspace, outside voice context limits.
    let summary = content;
    while (new TextEncoder().encode(summary).length > 480) summary = summary.slice(0, -1);
    controller.current?.appendCommentary({ delegationId: mapped.delegationId, content: summary, isCurrent: () => workspaceRef.current.isCurrent(request) });
  }, [workspace.answer, workspace.currentRequest, workspace.target.agentName, voice.status, spokenRequest]);

  const connected = voice.status === "connected";
  const connecting = voice.status === "connecting";
  const sessionEnded = workspace.snapshot.session.status === "ended";
  const canAsk = workspace.ready && !sessionEnded && !workspace.submitting;
  const activeRequest = workspace.currentRequest;
  const requestStatus = activeRequest?.state === "pending" ? "Waiting for agent" : activeRequest?.state === "unavailable" ? "Agent unavailable" : activeRequest?.state === "failed" ? "Request failed" : workspace.answer ? "Answer ready" : "Ready for your question";
  const micStatus = connected ? voice.muted ? "Mic muted" : "Mic on" : connecting ? "Connecting voice" : voice.status === "ending" ? "Ending voice" : sessionEnded ? "Conversation ended" : "Mic off";
  const status = workspace.loading ? "Opening workspace…" : sessionEnded ? "Conversation ended · Mic off" : `${micStatus} · ${requestStatus}`;

  const talk = async () => {
    setNotice(null);
    if (sessionEnded) { await workspace.start(); return; }
    if (workspace.snapshot.session.mode === "fixture") {
      setNotice("Voice is unavailable in fixture mode. Type a question to explore the workspace.");
      setComposerOpen(true);
      return;
    }
    await controller.current?.start(workspace.snapshot.session.id).catch(() => {});
  };

  const send = async (correction: boolean) => {
    if (!canAsk || !text.trim()) return;
    const revision = composerRevision.current;
    const result = await workspace.sendQuestion(text, correction);
    if (result && delegationId) setSpokenRequest({ requestId: result.requestId, revision: result.revision, delegationId });
    if (result && revision === composerRevision.current) { setText(""); setNotice(null); setComposerOpen(false); setDelegationId(null); }
  };

  const end = async () => {
    composerRevision.current++;
    setNotice(null); setDelegationId(null); setSpokenRequest(null);
    await Promise.all([controller.current?.end(), workspace.end()]);
  };

  return <section className="at-dock-position" aria-label="Persistent voice dock">
    <div className="at-dock">
      {notice && <p className="at-dock-message" role="status">{notice}</p>}
      {composerOpen && <form className="at-composer" onSubmit={(event) => { event.preventDefault(); void send(false); }}>
        <label htmlFor="agenttalkie-question">{activeRequest ? "Ask a new question or correct the current one" : `Ask ${workspace.target.agentName}`}</label>
        <textarea ref={textarea} id="agenttalkie-question" value={text} onChange={(event) => { composerRevision.current++; setText(event.target.value); }} maxLength={4000} placeholder="What should we focus on?" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(false); } }} />
        <div className="at-composer-footer"><small>{text.length}/4000</small><div className="at-actions" style={{ margin: 0 }}>
          {activeRequest && <button type="button" className="at-button" disabled={!canAsk || !text.trim()} onClick={() => void send(true)}>Correct question</button>}
          <button type="submit" className="at-button at-button-primary" disabled={!canAsk || !text.trim()}>{workspace.submitting ? "Submitting…" : activeRequest ? "Ask new question" : "Ask agent"}<Icon name="arrow" size={14} /></button>
        </div></div>
      </form>}
      {transcriptOpen && transcript && <div className="at-composer" aria-label="Voice transcript" style={{ maxHeight: 160, overflowY: "auto" }}>{transcript.fragments.map((fragment) => <p key={fragment.eventId} style={{ fontSize: 12, marginBottom: 8 }}><strong>{fragment.role === "user" ? "You" : "Voice"}:</strong> {fragment.text}</p>)}</div>}
      <p className="at-dock-status" role="status" aria-live="polite" data-voice-status={voice.status}>{status}</p>
      <div className="at-dock-controls">
        <button className="at-dock-keyboard" aria-expanded={composerOpen} aria-controls="agenttalkie-question" onClick={() => setComposerOpen((open) => !open)}><Icon name="keyboard" size={15} />Type</button>
        <button className="at-icon-button" aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"} title={voice.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={voice.muted} disabled={!connected} onClick={() => controller.current?.mute(!voice.muted)}><Icon name={voice.muted ? "muted" : "mic"} size={19} /></button>
        <button className="at-talk" disabled={workspace.loading || connecting || connected || voice.status === "ending" || (!workspace.ready && !sessionEnded)} onClick={() => void talk()}><Icon name={connected ? "wave" : "mic"} size={20} />{connecting ? "Connecting" : connected ? "Connected" : sessionEnded ? "New conversation" : "Talk"}</button>
        <button className="at-icon-button at-end" aria-label="End conversation" title="End conversation" disabled={sessionEnded || (!workspace.ready && !connecting && !connected)} onClick={() => void end()}><Icon name="end" size={19} /></button>
        {transcript ? <button className="at-icon-button" aria-label="Show voice transcript" aria-pressed={transcriptOpen} onClick={() => setTranscriptOpen((open) => !open)}><Icon name="source" size={17} /></button> : <span className="at-dock-spacer" />}
      </div>
      {voice.playbackBlocked && <button className="at-button" onClick={() => void controller.current?.resumeAudio()}>Enable audio playback</button>}
      {voice.status === "ended" && !voice.closeConfirmed && voice.liveSessionId && <p className="at-dock-status">Microphone stopped. Provider session closure was not confirmed.</p>}
    </div>
  </section>;
}
