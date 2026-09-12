"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLiveVoiceController, type LiveVoiceController, type LiveVoiceState, type TranscriptSnapshot } from "@/lib/voice/live-controller";
import { useAgentTalkie } from "./provider";
import { Icon } from "./icons";
import { SoundBar, type AudioActivity, type AudioSources } from "./sound-bar";

export function VoiceDock() {
  const workspace = useAgentTalkie();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const controller = useRef<LiveVoiceController | null>(null);
  const [voice, setVoice] = useState<LiveVoiceState>({ status: "idle", muted: false, liveSessionId: null, playbackBlocked: false, closeConfirmed: false, error: null });
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // A clarifying question from the agent is conversation, not a fault. Only a
  // real failure earns the alert palette.
  const [noticeTone, setNoticeTone] = useState<"info" | "alert">("info");
  const notify = useCallback((message: string | null, tone: "info" | "alert" = "info") => {
    setNotice(message);
    setNoticeTone(tone);
  }, []);
  const [transcript, setTranscript] = useState<TranscriptSnapshot | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [delegationId, setDelegationId] = useState<string | null>(null);
  const [spokenRequest, setSpokenRequest] = useState<{ requestId: string; revision: number; delegationId: string } | null>(null);
  const composerRevision = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const transcriptScroll = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<AudioSources>({ input: null, output: null });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const localEpoch = useRef(0);
  const [localConnecting, setLocalConnecting] = useState(false);
  const [localMuted, setLocalMuted] = useState(false);
  const [activity, setActivity] = useState<AudioActivity>({ input: false, output: false });
  const meterSources = useMemo(() => localStream ? { input: localStream, output: null } : sources, [localStream, sources]);
  const updateActivity = useCallback((next: AudioActivity) => setActivity(next), []);

  // Speech keeps arriving while the panel is open; the newest line must stay in view.
  useEffect(() => {
    const node = transcriptScroll.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [transcript?.inputText, transcript?.outputText, transcriptOpen]);

  useEffect(() => {
    let active = true;
    const transport = createLiveVoiceController({
      onState: (state) => { if (active) {setVoice(state); if(state.status === "connecting") {setTranscript(null);setSpokenRequest(null);}} },
      onTranscript: (value) => { if (active) {setTranscript(value);setTranscriptOpen(true);} },
      onError: (message) => { if (active) notify(message, "alert"); },
      onAudioSources: (value) => { if (active) setSources(value); },
      onDelegation: (event) => {
        if (!active) return;
        setTranscriptOpen(true);notify("Request received. Checking the workspace…");
        setSpokenRequest(null);
        const sessionId=workspaceRef.current.snapshot.session.id;
        void workspaceRef.current.delegate(event.delegationId,event.transcript.slice(-60).map(({role,text})=>({role,text:text.slice(0,4000)}))).then(result=>{
          if(!active||workspaceRef.current.snapshot.session.id!==sessionId)return;
          if(result?.status==="accepted") {setSpokenRequest({requestId:result.request.requestId,revision:result.request.revision,delegationId:event.delegationId});notify("Working on your request. Progress appears in Activity.");}
          else if(result?.status==="clarify") {notify(result.message);controller.current?.appendCommentary({delegationId:event.delegationId,content:result.message.slice(0,400),isCurrent:()=>workspaceRef.current.snapshot.session.id===sessionId&&workspaceRef.current.snapshot.session.status==="active"});}
        }).catch(()=>{if(active)notify("The spoken request could not be confirmed. Check the dashboard before trying again.", "alert");});
      },
    });
    controller.current = transport;
    return () => { active = false; localEpoch.current++; localRef.current?.getTracks().forEach((track) => track.stop()); controller.current = null; void transport.end(); };
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
    notify(null);
  }, [workspace.answer, workspace.currentRequest, workspace.target.agentName, voice.status, spokenRequest]);

  useEffect(() => {
    const request=workspace.currentRequest;
    if(!spokenRequest || !request?.error || request.requestId!==spokenRequest.requestId || request.revision!==spokenRequest.revision)return;
    controller.current?.appendCommentary({delegationId:spokenRequest.delegationId,content:request.error.message.slice(0,400),isCurrent:()=>workspaceRef.current.isCurrent(request)});
    notify(request.error.message, "alert");
  },[workspace.currentRequest,spokenRequest]);

  useEffect(() => {
    if(voice.status!=="connected")return;
    const timer=setTimeout(()=>{notify("The five-minute demo voice window ended. Your work is saved.");void controller.current?.end();},5*60*1000);
    return ()=>clearTimeout(timer);
  },[voice.status]);

  const connected = voice.status === "connected" || !!localStream;
  const connecting = voice.status === "connecting" || localConnecting;
  const muted = localStream ? localMuted : voice.muted;
  const sessionEnded = workspace.snapshot.session.status === "ended";
  const canAsk = workspace.ready && !sessionEnded && !workspace.submitting;
  const activeRequest = workspace.currentRequest;
  const requestPending = workspace.submitting || activeRequest?.state === "pending";
  const voiceState = workspace.loading ? "Opening workspace" : voice.error || activeRequest?.state === "failed" || activeRequest?.state === "unavailable" ? "Needs attention" : sessionEnded ? "Conversation ended" : activity.output ? "Speaking" : activity.input ? "Listening" : muted ? "Muted" : requestPending ? "Working" : connecting ? "Connecting" : localStream ? "Mic ready" : workspace.answer ? "Answer ready" : "Ready";
  const statusDetail = localStream ? "Local mic only" : requestPending ? "Waiting for agent" : activeRequest?.state === "failed" ? "Request failed" : activeRequest?.state === "unavailable" ? "Agent unavailable" : workspace.snapshot.session.mode === "fixture" ? "Fixture workspace" : connected ? "Live voice" : "Voice available";

  const talk = async () => {
    notify(null);
    if (connected) {
      if (localStream) { localStream.getAudioTracks().forEach((track) => { track.enabled = localMuted; }); setLocalMuted(!localMuted); }
      else controller.current?.mute(!voice.muted);
      return;
    }
    if (sessionEnded) { await workspace.start(); return; }
    if (workspace.snapshot.session.mode === "fixture") {
      await testMicrophone();
      return;
    }
    await controller.current?.start(workspace.snapshot.session.id, "/api/agenttalkie/live/voice").catch(() => {});
  };

  async function testMicrophone() {
    if (localRef.current || localConnecting || voice.status === "connected") return;
    const generation = ++localEpoch.current;
    setLocalConnecting(true); notify(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS or localhost in a supported browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (generation !== localEpoch.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      localRef.current = stream; setLocalStream(stream); setLocalMuted(false);
      notify(null);
      for (const track of stream.getAudioTracks()) track.addEventListener("ended", () => {
        if (localRef.current !== stream) return;
        localRef.current = null; setLocalStream(null); notify("Microphone disconnected. You can keep working by typing.", "alert");
      }, { once: true });
    } catch (cause) {
      if (generation === localEpoch.current) notify(cause instanceof Error && cause.name === "NotAllowedError" ? "Microphone access was denied. Allow access in the browser, or keep typing." : cause instanceof Error ? cause.message : "Microphone unavailable.");
    } finally { if (generation === localEpoch.current) setLocalConnecting(false); }
  }

  const send = async (correction: boolean) => {
    if (!canAsk || !text.trim()) return;
    const revision = composerRevision.current;
    const result = await workspace.sendQuestion(text, correction);
    if (result && delegationId) setSpokenRequest({ requestId: result.requestId, revision: result.revision, delegationId });
    if (result && revision === composerRevision.current) { setText(""); notify(null); setComposerOpen(false); setDelegationId(null); }
  };

  const end = async () => {
    const stoppingLocalTest = !!localRef.current || localConnecting;
    localEpoch.current++; localRef.current?.getTracks().forEach((track) => track.stop()); localRef.current = null;
    setLocalStream(null); setLocalConnecting(false); setLocalMuted(false);
    notify(null);
    if (stoppingLocalTest) return;
    composerRevision.current++;
    setDelegationId(null); setSpokenRequest(null);
    await Promise.all([controller.current?.end(), workspace.end()]);
  };

  const primaryLabel = connecting ? "Connecting" : connected ? muted ? "Unmute" : "Mute" : sessionEnded ? "New conversation" : workspace.snapshot.session.mode === "fixture" ? "Check mic" : "Start voice";

  return <section className={`at-dock-position${composerOpen || transcriptOpen || !!notice ? " at-dock-expanded" : ""}`} aria-label="Persistent voice dock">
    <div className="at-dock">
      {notice && <p className={`at-dock-message${noticeTone === "alert" ? " at-dock-message-alert" : ""}`} role={noticeTone === "alert" ? "alert" : "status"}>{notice}</p>}
      {composerOpen && <form className="at-composer" onSubmit={(event) => { event.preventDefault(); void send(false); }}>
        <label htmlFor="agenttalkie-question">{activeRequest ? "Ask a new question or correct the current one" : `Ask ${workspace.target.agentName}`}</label>
        <textarea ref={textarea} id="agenttalkie-question" value={text} onChange={(event) => { composerRevision.current++; setText(event.target.value); }} maxLength={4000} placeholder="What should we focus on?" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(false); } }} />
        <div className="at-composer-footer"><small>{text.length}/4000</small><div className="at-actions" style={{ margin: 0 }}>
          {activeRequest && <button type="button" className="at-button" disabled={!canAsk || !text.trim()} onClick={() => void send(true)}>Correct question</button>}
          <button type="submit" className="at-button at-button-primary" disabled={!canAsk || !text.trim()}>{workspace.submitting ? "Submitting…" : activeRequest ? "Ask new question" : "Ask agent"}<Icon name="arrow" size={14} /></button>
        </div></div>
      </form>}
      {transcriptOpen && transcript && <div className="at-transcript" aria-label="Voice transcript">
        <div className="at-transcript-scroll" ref={transcriptScroll} aria-live="polite">
          <div className="at-transcript-turn at-transcript-you">
            <p className="at-transcript-who">You</p>
            <p className="at-transcript-text">{transcript.inputText.slice(-900) || "Listening…"}</p>
          </div>
          {transcript.outputText && <div className="at-transcript-turn at-transcript-agent">
            <p className="at-transcript-who">{workspace.target.agentName}</p>
            <p className="at-transcript-text">{transcript.outputText.slice(-900)}</p>
          </div>}
        </div>
      </div>}
      <div className="at-voice-row">
        <div className="at-voice-summary">
          <strong>{workspace.target.agentName}</strong>
          <span className="at-voice-state" role="status" aria-live="polite" data-voice-status={localStream ? "local-test" : voice.status}><span className="at-voice-dot" />{voiceState}</span>
          <small>{statusDetail}</small>
        </div>
        <SoundBar sources={meterSources} muted={muted} local={!!localStream} onActivity={updateActivity} />
        <div className="at-dock-controls">
        <button className="at-dock-keyboard" aria-expanded={composerOpen} aria-controls="agenttalkie-question" onClick={() => setComposerOpen((open) => !open)}><Icon name="keyboard" size={15} />Type</button>
        <button className="at-talk" aria-label={connected ? muted ? "Unmute microphone" : "Mute microphone" : primaryLabel} aria-pressed={connected ? muted : undefined} disabled={workspace.loading || connecting || voice.status === "ending" || (!workspace.ready && !sessionEnded && !connected)} onClick={() => void talk()}><Icon name={connected && muted ? "muted" : "mic"} size={19} />{primaryLabel}</button>
        {!sessionEnded && (workspace.ready || connected || connecting) && <button className="at-icon-button at-end" aria-label={localStream || localConnecting ? "Stop microphone test" : "End conversation"} title={localStream || localConnecting ? "Stop microphone test" : "End conversation"} onClick={() => void end()}><Icon name="end" size={19} /></button>}
        {transcript && <button className="at-icon-button" aria-label="Show voice transcript" aria-pressed={transcriptOpen} onClick={() => setTranscriptOpen((open) => !open)}><Icon name="source" size={17} /></button>}
        </div>
      </div>
      {voice.playbackBlocked && <button className="at-button" onClick={() => void controller.current?.resumeAudio()}>Enable audio playback</button>}
      {voice.status === "ended" && !voice.closeConfirmed && voice.liveSessionId && <p className="at-dock-status">Microphone stopped. Provider session closure was not confirmed.</p>}
    </div>
  </section>;
}
