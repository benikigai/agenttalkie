"use client";

import { useEffect, useRef, useState } from "react";
import { createAudioMeter } from "@/lib/voice/audio-meter";

export interface AudioSources {
  input: MediaStream | null;
  output: HTMLAudioElement | null;
}

export function SoundBar({ sources, muted, local }: { sources: AudioSources; muted: boolean; local: boolean }) {
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
    const inputHistory = Array<number>(64).fill(0);
    const outputHistory = Array<number>(64).fill(0);
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
      const height = 54;
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

      for (const [values, y, color, level] of [[inputHistory, 13, "#9fc6ac", inputLevel], [outputHistory, 41, "#e7b88d", outputLevel]] as const) {
        drawing.strokeStyle = color;
        drawing.fillStyle = color;
        drawing.lineWidth = 1.35;
        if (motion.matches) {
          drawing.globalAlpha = .3;
          drawing.fillRect(0, y - 2, width, 4);
          drawing.globalAlpha = .9;
          drawing.fillRect(0, y - 2, width * level, 4);
        } else {
          drawing.globalAlpha = .22;
          drawing.beginPath(); drawing.moveTo(0, y); drawing.lineTo(width, y); drawing.stroke();
          drawing.globalAlpha = .95;
          drawing.beginPath();
          for (let i = 0; i < values.length; i++) {
            const x = i * width / (values.length - 1);
            const amplitude = values[i] * 11;
            drawing.moveTo(x, y - amplitude); drawing.lineTo(x, y + Math.max(.35, amplitude));
          }
          drawing.stroke();
        }
      }
      if (input || output) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(frame); input?.dispose(); output?.dispose(); void context?.close(); };
  }, [sources]);

  return <div className="at-sound-bar">
    <div className="at-sound-labels"><span>You</span><span>Agent</span></div>
    <canvas ref={canvas} aria-hidden="true" />
    <span className="at-sr-only">{meterError ? "Audio meter unavailable." : local ? "Local microphone meter. Audio stays in this browser." : "Separate microphone and agent audio meters."}</span>
    {meterError && <span className="at-meter-error">Meter unavailable</span>}
  </div>;
}
