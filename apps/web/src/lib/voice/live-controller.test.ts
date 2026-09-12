import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createLiveVoiceController, type LiveDelegation, type TranscriptSnapshot } from "./live-controller";

const APP_SESSION = "9c82d048-3f57-4c18-9fce-bab5c7b70856";
const LIVE_SESSION = "live_voice_test";

class Track extends EventTarget {
  enabled = true;
  stopped = false;
  stop() { this.stopped = true; }
}
class Stream {
  constructor(readonly tracks: Track[] = [new Track()]) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
}
class Channel extends EventTarget {
  readyState = "open";
  sent: Record<string, unknown>[] = [];
  close() { this.readyState = "closed"; this.dispatchEvent(new Event("close")); }
  receive(event: object) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) })); }
  send(raw: string) {
    const event = JSON.parse(raw);
    this.sent.push(event);
    if (event.type === "session.close") {
      this.receive({ type: "session.closed", session: { id: LIVE_SESSION }, usage: { seconds: 2 } });
    }
  }
}
class Peer extends EventTarget {
  channel = new Channel();
  channelCreated = false;
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription: { sdp: string } | null = null;
  remoteDescription: object | null = null;
  closed = false;
  addTrack() {}
  getReceivers() { return []; }
  createDataChannel(label: string) { assert.equal(label, "oai-events"); this.channelCreated = true; return this.channel; }
  async createOffer() { assert.equal(this.channelCreated, true); return { type: "offer", sdp: "offer_sdp" }; }
  async setLocalDescription(offer: { sdp: string }) { this.localDescription = offer; }
  async setRemoteDescription(answer: object) {
    this.remoteDescription = answer;
    this.channel.receive({ type: "session.started", session: { id: LIVE_SESSION, model: "gpt-live-1" } });
  }
  close() { this.closed = true; this.connectionState = "closed"; }
}
class AudioOutput {
  autoplay = false;
  srcObject: unknown = null;
  paused = false;
  rejectPlayback = false;
  setAttribute() {}
  pause() { this.paused = true; }
  async play() { if (this.rejectPlayback) throw new Error("Autoplay blocked"); this.paused = false; }
}

function browser(t: TestContext) {
  const stream = new Stream();
  const peers: Peer[] = [];
  const outputs: AudioOutput[] = [];
  const requests: Array<{ url: unknown; body: unknown }> = [];
  const originals = new Map<string, PropertyDescriptor | undefined>();
  function replace(key: string, value: unknown) {
    if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  replace("navigator", { mediaDevices: { getUserMedia: async () => stream } });
  replace("RTCPeerConnection", class extends Peer { constructor() { super(); peers.push(this); } });
  replace("MediaStream", Stream);
  replace("Audio", class extends AudioOutput { constructor() { super(); outputs.push(this); } });
  replace("fetch", async (url: unknown, options: { body: string }) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ sessionId: LIVE_SESSION, provider: "openai", model: "gpt-live-1", sdp: "answer_sdp" }) };
  });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return { stream, peers, outputs, requests, replace };
}

function transcript(channel: Channel, eventId: string, text: string, role: "user" | "assistant" = "user") {
  channel.receive({
    type: role === "user" ? "session.input_transcript.delta" : "session.output_transcript.delta",
    event_id: eventId, delta: text, start_ms: 100, end_ms: 200,
  });
}
function delegate(channel: Channel, id: string) {
  channel.receive({ type: "session.delegation.created", event_id: `event_${id}`, offset_ms: 220, delegation: { id, type: "delegation", target: "client" } });
}

test("connects through the app route, preserves mute, and confirms graceful end", async (t) => {
  const env = browser(t);
  const controller = createLiveVoiceController();
  assert.equal(env.requests.length, 0);
  await controller.start(APP_SESSION);
  assert.equal(controller.getState().status, "connected");
  assert.equal(controller.getState().liveSessionId, LIVE_SESSION);
  assert.deepEqual(env.requests, [{ url: "/api/agenttalkie/voice", body: { sessionId: APP_SESSION, sdp: "offer_sdp" } }]);
  assert.deepEqual(env.peers[0].channel.sent, []);
  controller.mute(true);
  assert.equal(env.stream.tracks[0].enabled, false);
  assert.equal(env.stream.tracks[0].stopped, false);
  assert.equal(env.peers[0].closed, false);
  controller.mute(false);
  assert.equal(env.stream.tracks[0].enabled, true);
  await controller.end();
  assert.equal(env.stream.tracks[0].stopped, true);
  assert.equal(env.peers[0].closed, true);
  assert.equal(controller.getState().closeConfirmed, true);
  assert.equal(controller.getState().status, "ended");
  assert.deepEqual(env.peers[0].channel.sent, [{ type: "session.close" }]);
});

test("keeps overlapping exact transcripts and marks delegation windows incomplete", async (t) => {
  const env = browser(t);
  const snapshots: TranscriptSnapshot[] = [];
  const delegations: LiveDelegation[] = [];
  const controller = createLiveVoiceController({ onTranscript: (value) => snapshots.push(value), onDelegation: (value) => delegations.push(value) });
  await controller.start(APP_SESSION);
  const channel = env.peers[0].channel;
  transcript(channel, "a", "What is ");
  transcript(channel, "b", "Let me check", "assistant");
  transcript(channel, "c", "blocking launch?");
  transcript(channel, "c", "blocking launch?");
  delegate(channel, "del_1");
  delegate(channel, "del_1");
  transcript(channel, "d", "Only the mobile issue.");
  delegate(channel, "del_2");
  assert.equal(snapshots[2].inputText, "What is blocking launch?");
  assert.equal(delegations.length, 2);
  assert.equal(delegations[0].inputText, "What is blocking launch?");
  assert.equal(delegations[0].inputTextComplete, false);
  assert.equal(delegations[1].inputText, "Only the mobile issue.");
  assert.equal(delegations[1].transcript.length, 4);
  await controller.end();
  transcript(channel, "e", "Obsolete after end");
  assert.equal(snapshots.length, 4);
});

test("never appends unknown, stale, duplicate, oversized, or ended commentary", async (t) => {
  const env = browser(t);
  const controller = createLiveVoiceController();
  await controller.start(APP_SESSION);
  const channel = env.peers[0].channel;
  const update = { delegationId: "del_1", content: "The existing worker found a microphone issue.", isCurrent: () => true };
  assert.equal(controller.appendCommentary(update), false);
  delegate(channel, "del_1");
  assert.equal(controller.appendCommentary({ ...update, isCurrent: () => false }), false);
  assert.equal(controller.appendCommentary({ ...update, content: "界".repeat(200) }), false);
  assert.equal(controller.appendCommentary(update), true);
  assert.equal(controller.appendCommentary(update), false);
  assert.equal(channel.sent[0].type, "session.commentary.append");
  assert.equal(channel.sent[0].delegation_id, "del_1");
  await controller.end();
  assert.equal(controller.appendCommentary({ ...update, content: "Late answer" }), false);
});

test("End while permission is pending stops late media and never creates a session", async (t) => {
  const env = browser(t);
  let grant!: (stream: Stream) => void;
  env.replace("navigator", { mediaDevices: { getUserMedia: () => new Promise<Stream>((resolve) => { grant = resolve; }) } });
  const controller = createLiveVoiceController();
  const started = controller.start(APP_SESSION);
  const rejected = assert.rejects(started, /ended/);
  await controller.end();
  grant(env.stream);
  await rejected;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.stream.tracks[0].stopped, true);
  assert.equal(env.requests.length, 0);
  assert.equal(controller.getState().status, "ended");
});

test("End during the HTTP request rejects late SDP and closes resources", async (t) => {
  const env = browser(t);
  let reply!: (value: unknown) => void;
  let requested!: () => void;
  const requestSeen = new Promise<void>((resolve) => { requested = resolve; });
  env.replace("fetch", () => { requested(); return new Promise((resolve) => { reply = resolve; }); });
  const controller = createLiveVoiceController();
  const started = controller.start(APP_SESSION);
  const rejected = assert.rejects(started, /ended/);
  await requestSeen;
  await controller.end();
  reply({ ok: true, json: async () => ({ sessionId: LIVE_SESSION, provider: "openai", model: "gpt-live-1", sdp: "late_answer" }) });
  await rejected;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.peers[0].remoteDescription, null);
  assert.equal(env.peers[0].closed, true);
  assert.equal(env.stream.tracks[0].stopped, true);
});

test("reports denied microphones without dispatching a request", async (t) => {
  const env = browser(t);
  env.replace("navigator", { mediaDevices: { getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } } });
  const controller = createLiveVoiceController();
  await assert.rejects(controller.start(APP_SESSION), /Microphone access was denied/);
  assert.equal(controller.getState().status, "error");
  assert.equal(env.requests.length, 0);
});

test("HTTP success without session.started never reports connected", async (t) => {
  const env = browser(t);
  class UnreadyPeer extends Peer {
    async setRemoteDescription(answer: object) { this.remoteDescription = answer; }
  }
  env.replace("RTCPeerConnection", class extends UnreadyPeer { constructor() { super(); env.peers.push(this); } });
  const controller = createLiveVoiceController();
  const started = controller.start(APP_SESSION);
  const rejected = assert.rejects(started, /ended/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().status, "connecting");
  await controller.end();
  await rejected;
});

test("transport loss closes the microphone and remains visibly disconnected", async (t) => {
  const env = browser(t);
  const controller = createLiveVoiceController();
  await controller.start(APP_SESSION);
  env.peers[0].connectionState = "disconnected";
  env.peers[0].dispatchEvent(new Event("connectionstatechange"));
  assert.equal(controller.getState().status, "disconnected");
  assert.equal(controller.getState().closeConfirmed, false);
  assert.equal(env.stream.tracks[0].stopped, true);
  assert.deepEqual(env.peers[0].channel.sent, [{ type: "session.close" }]);
});

test("blocked speaker playback can be retried without reconnecting", async (t) => {
  const env = browser(t);
  const controller = createLiveVoiceController();
  await controller.start(APP_SESSION);
  env.outputs[0].rejectPlayback = true;
  const receivedTrack = new Event("track");
  Object.defineProperty(receivedTrack, "track", { value: new Track() });
  env.peers[0].dispatchEvent(receivedTrack);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().playbackBlocked, true);
  assert.equal(controller.getState().status, "connected");
  env.outputs[0].rejectPlayback = false;
  await controller.resumeAudio();
  assert.equal(controller.getState().playbackBlocked, false);
  assert.equal(env.requests.length, 1);
  await controller.end();
  assert.equal(env.outputs[0].paused, true);
  assert.equal(env.outputs[0].srcObject, null);
});
