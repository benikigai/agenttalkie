export function audioLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const value of samples) sum += value * value;
  const rms = Math.sqrt(sum / samples.length);
  // Suppress the microphone noise floor; retain speech dynamics without auto-normalizing silence.
  return Math.min(1, Math.max(0, (Math.sqrt(rms) - 0.045) * 1.8));
}

export function createAudioMeter(stream: MediaStream, context: AudioContext) {
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  return {
    read() {
      if (context.state !== "running" || !stream.getAudioTracks().some((track) => track.enabled && track.readyState === "live")) return 0;
      analyser.getFloatTimeDomainData(samples);
      return audioLevel(samples);
    },
    dispose() { source.disconnect(); analyser.disconnect(); },
  };
}
