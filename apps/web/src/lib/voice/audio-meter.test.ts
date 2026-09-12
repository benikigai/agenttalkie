import assert from "node:assert/strict";
import test from "node:test";
import { audioLevel, createAudioMeter } from "./audio-meter";

test("silence stays flat and speech levels retain dynamics within bounds", () => {
  assert.equal(audioLevel(new Float32Array()), 0);
  assert.equal(audioLevel(new Float32Array(1024)), 0);
  assert.equal(audioLevel(new Float32Array([0.001, -0.001])), 0);
  const quiet = audioLevel(new Float32Array([0.02, -0.02]));
  const loud = audioLevel(new Float32Array([0.2, -0.2]));
  assert.ok(quiet > 0 && loud > quiet);
  assert.equal(audioLevel(new Float32Array([1, -1])), 1);
});

test("meter gates muted, ended, and suspended sources and disconnects without speaker routing", () => {
  let disconnected = 0;
  const track = { enabled: true, readyState: "live" };
  const analyser = { fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(0.2), disconnect: () => disconnected++ };
  const source = { connect: (target: unknown) => assert.equal(target, analyser), disconnect: () => disconnected++ };
  const context = { state: "running", createMediaStreamSource: () => source, createAnalyser: () => analyser };
  const meter = createAudioMeter({ getAudioTracks: () => [track] } as unknown as MediaStream, context as unknown as AudioContext);
  assert.ok(meter.read() > 0);
  track.enabled = false;
  assert.equal(meter.read(), 0);
  track.enabled = true;
  track.readyState = "ended";
  assert.equal(meter.read(), 0);
  track.readyState = "live";
  context.state = "suspended";
  assert.equal(meter.read(), 0);
  meter.dispose();
  assert.equal(disconnected, 2);
});
