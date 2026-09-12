"use client";

import { useEffect, useRef, useState } from "react";
import { createAudioMeter } from "@/lib/voice/audio-meter";

export interface AudioSources {
  input: MediaStream | null;
  output: HTMLAudioElement | null;
}

export interface AudioActivity {
  input: boolean;
  output: boolean;
}

export function SoundBar({ sources, muted, local, onActivity }: { sources: AudioSources; muted: boolean; local: boolean; onActivity?: (activity: AudioActivity) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [meterError, setMeterError] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const drawing = element.getContext("2d");
    if (!drawing) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const inputHistory = Array<number>(72).fill(0);
    const outputHistory = Array<number>(72).fill(0);
    let lastActivity: AudioActivity = { input: false, output: false };
    let context: AudioContext | null = null;
    let input: ReturnType<typeof createAudioMeter> | null = null;
    let output: ReturnType<typeof createAudioMeter> | null = null;
    let frame = 0;
    let lastFrame = 0;
    let stopped = false;
    setMeterError(false);
    try {
      if (sources.input || sources.output?.srcObject) {
        context = new AudioContext();
        if (sources.input) input = createAudioMeter(sources.input, context);
        if (sources.output?.srcObject instanceof MediaStream) output = createAudioMeter(sources.output.srcObject, context);
        void context.resume().catch(() => { if (!stopped) setMeterError(true); });
      }
    } catch { setMeterError(true); }

    function draw(now: number) {
      if (stopped || !element || !drawing) return;
      if (now - lastFrame < (motion.matches ? 200 : 33)) { frame = requestAnimationFrame(draw); return; }
      lastFrame = now;
      const width = element.clientWidth;
      const height = 34;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (element.width !== Math.round(width * ratio)) element.width = Math.round(width * ratio);
      if (element.height !== height * ratio) element.height = height * ratio;
      drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawing.clearRect(0, 0, width, height);
      const inputLevel = mutedRef.current ? 0 : input?.read() ?? 0;
      const playing = sources.output && !sources.output.paused && !sources.output.muted && sources.output.volume > 0;
      const outputLevel = playing ? output?.read() ?? 0 : 0;
      inputHistory.shift(); inputHistory.push(inputLevel);
      outputHistory.shift(); outputHistory.push(outputLevel);
      if (mutedRef.current) inputHistory.fill(0);
      if (!playing) outputHistory.fill(0);
      element.dataset.inputLevel = inputLevel.toFixed(3);
      element.dataset.outputLevel = outputLevel.toFixed(3);
      const nextActivity = { input: inputLevel > .025, output: outputLevel > .025 };
      if (nextActivity.input !== lastActivity.input || nextActivity.output !== lastActivity.output) {
        lastActivity = nextActivity;
        onActivity?.(nextActivity);
      }

      drawing.strokeStyle = "#617067";
      drawing.globalAlpha = .32;
      drawing.lineWidth = 1;
      drawing.beginPath(); drawing.moveTo(0, height / 2); drawing.lineTo(width, height / 2); drawing.stroke();
      for (const [values, direction, color, level] of [[inputHistory, -1, "#b8d5bf", inputLevel], [outputHistory, 1, "#efbd8f", outputLevel]] as const) {
        drawing.strokeStyle = color;
        drawing.lineWidth = 1.75;
        if (motion.matches) {
          drawing.globalAlpha = .9;
          drawing.beginPath();
          drawing.moveTo(0, height / 2);
          drawing.lineTo(width * level, height / 2 + direction * 5);
          drawing.stroke();
        } else {
          drawing.globalAlpha = .95;
          drawing.beginPath();
          for (let i = 0; i < values.length; i++) {
            const x = i * width / (values.length - 1);
            const amplitude = Math.min(values[i] * 20, 14);
            const y = height / 2 + direction * amplitude;
            if (i === 0) drawing.moveTo(x, y); else drawing.lineTo(x, y);
          }
          drawing.stroke();
        }
      }
      if (input || output) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(frame); input?.dispose(); output?.dispose(); onActivity?.({ input: false, output: false }); void context?.close(); };
  }, [sources, onActivity]);

  return <div className="at-sound-bar">
    <canvas ref={canvas} aria-hidden="true" />
    <span className="at-sr-only">{meterError ? "Audio meter unavailable." : local ? "Live local microphone meter. Audio stays in this browser." : "Live microphone and agent audio meter."}</span>
    {meterError && <span className="at-meter-error">Meter unavailable</span>}
  </div>;
}
