import { z } from "zod";
import {
  AGENTTALKIE_ROUTES,
  ApiErrorSchema,
  VoiceConnectionSchema,
} from "../agenttalkie-contract";

export type LiveVoiceStatus =
  | "idle" | "connecting" | "connected" | "ending" | "ended" | "disconnected" | "error";

export interface LiveVoiceState {
  status: LiveVoiceStatus;
  muted: boolean;
  liveSessionId: string | null;
  playbackBlocked: boolean;
  closeConfirmed: boolean;
  error: string | null;
}

export interface TranscriptFragment {
  eventId: string;
  role: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSnapshot {
  fragments: readonly TranscriptFragment[];
  inputText: string;
  outputText: string;
}

export interface LiveDelegation {
  delegationId: string;
  offsetMs: number;
  transcript: readonly TranscriptFragment[];
  inputText: string;
  outputText: string;
  inputTextComplete: false;
  inputTextScope: "since_previous_delegation";
}

export interface LiveVoiceCallbacks {
  onAudioSources?(sources: { input: MediaStream | null; output: HTMLAudioElement | null }): void;
  onState?(state: LiveVoiceState): void;
  onTranscript?(transcript: TranscriptSnapshot): void;
  onDelegation?(delegation: LiveDelegation): void;
  onError?(message: string): void;
}

export interface LiveVoiceController {
  start(sessionId: string): Promise<void>;
  mute(muted: boolean): void;
  end(): Promise<void>;
  appendCommentary(update: {
    delegationId: string;
    content: string;
    isCurrent: () => boolean;
  }): boolean;
  resumeAudio(): Promise<void>;
  getState(): LiveVoiceState;
}

const TranscriptEventSchema = z.object({
  event_id: z.string().min(1),
  delta: z.string(),
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
});
const DelegationEventSchema = z.object({
  event_id: z.string().min(1),
  offset_ms: z.number().nonnegative(),
  delegation: z.object({
    id: z.string().min(1),
    type: z.literal("delegation"),
    target: z.enum(["client", "responses"]),
  }),
});
const StartedEventSchema = z.object({
  session: z.object({ id: z.string().min(1), model: z.literal("gpt-live-1") }),
});
const ClosedEventSchema = z.object({
  session: z.object({ id: z.string().min(1) }),
  usage: z.object({ seconds: z.number().nonnegative() }),
});

interface Connection {
  abort: AbortController;
  peer?: RTCPeerConnection;
  channel?: RTCDataChannel;
  microphone?: MediaStream;
  audio?: HTMLAudioElement;
  closing: boolean;
  ready: boolean;
  creationRequested: boolean;
  closeRequested: boolean;
  liveSessionId?: string;
  listeners: Array<() => void>;
  timeout?: ReturnType<typeof setTimeout>;
  closeTimeout?: ReturnType<typeof setTimeout>;
  readyPromise: Promise<void>;
  resolveReady(): void;
  rejectReady(error: Error): void;
  startPromise?: Promise<void>;
  endPromise?: Promise<void>;
  resolveEnd?(): void;
  transcript: TranscriptFragment[];
  eventIds: Set<string>;
  delegations: Set<string>;
  lastDelegationIndex: number;
  commentary: Set<string>;
}

function microphoneError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") return "Microphone access was denied. Allow it in your browser and try Talk again.";
    if (error.name === "NotFoundError") return "No microphone was found. Connect a microphone and try again.";
    if (error.name === "NotReadableError") return "The microphone is unavailable. Check whether another application is using it.";
    if (error.name === "AbortError") return "Voice connection was cancelled.";
    if (error instanceof TypeError) return "Could not reach the voice service. Check your connection and try again.";
    return error.message;
  }
  return "Could not start voice. Please try again.";
}

/** Browser-only transport. Construction does not open a microphone or session. */
export function createLiveVoiceController(callbacks: LiveVoiceCallbacks = {}): LiveVoiceController {
  let connection: Connection | undefined;
  let state: LiveVoiceState = {
    status: "idle", muted: false, liveSessionId: null,
    playbackBlocked: false, closeConfirmed: false, error: null,
  };

  function update(patch: Partial<LiveVoiceState>) {
    state = { ...state, ...patch };
    callbacks.onState?.({ ...state });
  }

  function current(run: Connection) {
    return connection === run && !run.closing;
  }

  function listen(target: EventTarget, type: string, handler: EventListener, run: Connection) {
    target.addEventListener(type, handler);
    run.listeners.push(() => target.removeEventListener(type, handler));
  }

  function silence(run: Connection) {
    callbacks.onAudioSources?.({ input: null, output: null });
    run.microphone?.getTracks().forEach((track) => track.stop());
    if (run.audio) {
      run.audio.pause();
      run.audio.srcObject = null;
    }
  }

  function cleanup(run: Connection) {
    clearTimeout(run.timeout);
    clearTimeout(run.closeTimeout);
    run.abort.abort();
    silence(run);
    run.listeners.splice(0).forEach((remove) => remove());
    if (run.ready && !run.closeRequested && run.channel?.readyState === "open") {
      run.closeRequested = true;
      try { run.channel.send(JSON.stringify({ type: "session.close" })); } catch { /* Transport failure leaves finalization unconfirmed. */ }
    }
    run.channel?.close();
    run.peer?.getReceivers().forEach((receiver) => receiver.track?.stop());
    run.peer?.close();
    if (connection === run) connection = undefined;
    run.resolveEnd?.();
  }

  function fail(run: Connection, message: string, status: "error" | "disconnected" = "error") {
    if (!current(run)) return;
    run.closing = true;
    run.rejectReady(new Error(message));
    cleanup(run);
    update({ status, muted: true, error: message, playbackBlocked: false, closeConfirmed: false });
    callbacks.onError?.(message);
  }

  function finish(run: Connection, confirmed: boolean) {
    if (connection !== run) return;
    run.closing = true;
    run.rejectReady(new Error("Voice conversation ended."));
    cleanup(run);
    update({
      status: "ended", muted: true, playbackBlocked: false, closeConfirmed: confirmed,
      error: confirmed || !run.creationRequested ? null : "Audio stopped. The service did not confirm final session closure.",
    });
  }

  async function play(run: Connection) {
    if (!current(run) || !run.audio) return;
    try {
      await run.audio.play();
      if (current(run)) update({ playbackBlocked: false });
    } catch {
      if (current(run)) update({ playbackBlocked: true });
    }
  }

  function receive(run: Connection, raw: unknown) {
    if (connection !== run || typeof raw !== "string") return;
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      event = parsed as Record<string, unknown>;
    } catch {
      fail(run, "The voice service sent an unreadable event. End the call and reconnect.");
      return;
    }
    if (event.type === "session.closed") {
      const result = ClosedEventSchema.safeParse(event);
      run.closeRequested = true;
      finish(run, result.success && result.data.session.id === run.liveSessionId);
      return;
    }
    if (!current(run)) return;

    if (event.type === "session.started") {
      const result = StartedEventSchema.safeParse(event);
      if (!result.success || (run.liveSessionId && run.liveSessionId !== result.data.session.id)) {
        fail(run, "The voice service returned an unexpected session. Please reconnect.");
        return;
      }
      run.liveSessionId = result.data.session.id;
      run.ready = true;
      clearTimeout(run.timeout);
      update({ status: "connected", liveSessionId: run.liveSessionId, error: null });
      run.resolveReady();
      return;
    }

    if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
      const result = TranscriptEventSchema.safeParse(event);
      if (!result.success) {
        fail(run, "The voice service returned an invalid transcript event.");
        return;
      }
      if (run.eventIds.has(result.data.event_id)) return;
      run.eventIds.add(result.data.event_id);
      run.transcript.push({
        eventId: result.data.event_id,
        role: event.type === "session.input_transcript.delta" ? "user" : "assistant",
        text: result.data.delta, startMs: result.data.start_ms, endMs: result.data.end_ms,
      });
      callbacks.onTranscript?.({
        fragments: run.transcript.map((fragment) => ({ ...fragment })),
        inputText: run.transcript.filter((fragment) => fragment.role === "user").map((fragment) => fragment.text).join(""),
        outputText: run.transcript.filter((fragment) => fragment.role === "assistant").map((fragment) => fragment.text).join(""),
      });
      return;
    }

    if (event.type === "session.delegation.created") {
      const result = DelegationEventSchema.safeParse(event);
      if (!result.success) {
        fail(run, "The voice service returned an invalid work request.");
        return;
      }
      if (result.data.delegation.target !== "client") {
        fail(run, "This voice session is not configured to use your existing agent.");
        return;
      }
      const delegationId = result.data.delegation.id;
      if (run.delegations.has(delegationId)) return;
      run.delegations.add(delegationId);
      const window = run.transcript.slice(run.lastDelegationIndex);
      run.lastDelegationIndex = run.transcript.length;
      callbacks.onDelegation?.({
        delegationId, offsetMs: result.data.offset_ms,
        transcript: run.transcript.map((fragment) => ({ ...fragment })),
        inputText: window.filter((fragment) => fragment.role === "user").map((fragment) => fragment.text).join(""),
        outputText: window.filter((fragment) => fragment.role === "assistant").map((fragment) => fragment.text).join(""),
        // Live fragments have no authoritative turn boundary. This is a delivery window.
        inputTextComplete: false, inputTextScope: "since_previous_delegation",
      });
      return;
    }

    if (event.type === "error") {
      fail(run, "The voice service rejected a command. End the call and reconnect.");
    }
  }

  async function gatherIce(run: Connection, peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => done(new Error("Could not negotiate the audio connection. Please try again.")), 10_000);
      function done(error?: Error) {
        clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", check);
        run.abort.signal.removeEventListener("abort", abort);
        if (error) reject(error); else resolve();
      }
      function check() { if (peer.iceGatheringState === "complete") done(); }
      function abort() { done(new Error("Voice connection was cancelled.")); }
      peer.addEventListener("icegatheringstatechange", check);
      run.abort.signal.addEventListener("abort", abort, { once: true });
      if (run.abort.signal.aborted) abort(); else check();
    });
  }

  async function connect(run: Connection, sessionId: string) {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        throw new Error("Voice needs a supported browser on HTTPS or localhost.");
      }
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current(run)) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      run.microphone = microphone;
      callbacks.onAudioSources?.({ input: microphone, output: null });
      const peer = new RTCPeerConnection();
      run.peer = peer;
      run.audio = new Audio();
      run.audio.autoplay = true;
      run.audio.setAttribute("playsinline", "");
      for (const track of microphone.getAudioTracks()) {
        track.enabled = !state.muted;
        peer.addTrack(track, microphone);
        listen(track, "ended", () => fail(run, "The microphone disconnected. Reconnect it and select Talk again."), run);
      }
      listen(peer, "track", (event) => {
        const track = (event as RTCTrackEvent).track;
        if (!current(run)) { track.stop(); return; }
        run.audio!.srcObject = new MediaStream([track]);
        callbacks.onAudioSources?.({ input: run.microphone ?? null, output: run.audio ?? null });
        void play(run);
      }, run);
      listen(peer, "connectionstatechange", () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          fail(run, "Voice disconnected. Select Talk to reconnect; pending agent work may still be running.", "disconnected");
        }
      }, run);
      const channel = peer.createDataChannel("oai-events");
      run.channel = channel;
      listen(channel, "message", (event) => receive(run, (event as MessageEvent).data), run);
      listen(channel, "error", () => fail(run, "The voice connection failed. Please reconnect."), run);
      listen(channel, "close", () => {
        if (run.closing) finish(run, false);
        else fail(run, "Voice disconnected before final closure was confirmed.", "disconnected");
      }, run);

      const offer = await peer.createOffer();
      if (!current(run)) return;
      await peer.setLocalDescription(offer);
      if (!current(run)) return;
      await gatherIce(run, peer);
      if (!current(run)) return;
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("The browser could not prepare an audio connection.");
      run.creationRequested = true;
      const response = await fetch(AGENTTALKIE_ROUTES.voice, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sdp }), signal: run.abort.signal,
      });
      if (!current(run)) return;
      let body: unknown;
      try { body = await response.json(); }
      catch { throw new Error("The voice service returned an unreadable response. Please try again."); }
      if (!current(run)) return;
      if (!response.ok) {
        const error = ApiErrorSchema.safeParse(body);
        throw new Error(error.success ? error.data.error.message : "The voice service is unavailable. Try again later.");
      }
      const result = VoiceConnectionSchema.safeParse(body);
      if (!result.success) throw new Error("The voice service returned an invalid connection. Please try again.");
      run.liveSessionId = result.data.sessionId;
      await peer.setRemoteDescription({ type: "answer", sdp: result.data.sdp });
      if (!current(run)) return;
      // HTTP already starts Live. Only session.started establishes readiness.
      await run.readyPromise;
    } catch (error) {
      if (current(run)) fail(run, microphoneError(error));
    }
  }

  return {
    getState: () => ({ ...state }),
    start(sessionId) {
      if (connection?.closing) return Promise.reject(new Error("The previous voice connection is still ending."));
      if (connection) return connection.startPromise ?? Promise.resolve();
      let resolveReady!: () => void;
      let rejectReady!: (error: Error) => void;
      const readyPromise = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      // A permission prompt can outlive End before connect starts awaiting readiness.
      void readyPromise.catch(() => {});
      const run: Connection = {
        abort: new AbortController(), closing: false, ready: false, creationRequested: false, closeRequested: false, listeners: [],
        readyPromise, resolveReady, rejectReady,
        transcript: [], eventIds: new Set(), delegations: new Set(),
        lastDelegationIndex: 0, commentary: new Set(),
      };
      connection = run;
      update({ status: "connecting", muted: false, liveSessionId: null, playbackBlocked: false, closeConfirmed: false, error: null });
      run.timeout = setTimeout(() => fail(run, "Voice connection timed out. Check microphone permission and try again."), 30_000);
      void connect(run, sessionId);
      run.startPromise = readyPromise;
      return readyPromise;
    },
    mute(muted) {
      const run = connection;
      if (!run || !current(run)) return;
      run.microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      update({ muted });
    },
    end() {
      const run = connection;
      if (!run) {
        if (state.status !== "ended") update({ status: "ended", muted: true });
        return Promise.resolve();
      }
      if (run.endPromise) return run.endPromise;
      run.closing = true;
      run.rejectReady(new Error("Voice conversation ended."));
      run.abort.abort();
      clearTimeout(run.timeout);
      silence(run);
      update({ status: "ending", muted: true, playbackBlocked: false });
      run.endPromise = new Promise<void>((resolve) => { run.resolveEnd = resolve; });
      if (run.ready && run.channel?.readyState === "open") {
        try {
          run.closeTimeout = setTimeout(() => finish(run, false), 5_000);
          run.closeRequested = true;
          run.channel.send(JSON.stringify({ type: "session.close" }));
        } catch { finish(run, false); }
      } else {
        finish(run, false);
      }
      return run.endPromise;
    },
    appendCommentary({ delegationId, content, isCurrent }) {
      const run = connection;
      if (!run || !current(run) || !run.ready || run.channel?.readyState !== "open" || !run.delegations.has(delegationId) || !isCurrent()) return false;
      if (!content.trim() || new TextEncoder().encode(content).length > 500) {
        callbacks.onError?.("The spoken summary must be nonempty and at most 500 UTF-8 bytes. Keep the full answer in the result card.");
        return false;
      }
      const key = JSON.stringify([delegationId, content]);
      if (run.commentary.has(key)) return false;
      try {
        run.channel.send(JSON.stringify({
          type: "session.commentary.append", event_id: crypto.randomUUID(),
          delegation_id: delegationId, content,
        }));
        run.commentary.add(key);
        return true;
      } catch {
        fail(run, "Could not send the spoken result. The answer remains in the result card.");
        return false;
      }
    },
    async resumeAudio() { if (connection) await play(connection); },
  };
}
