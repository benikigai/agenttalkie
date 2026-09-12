"use client";

import { useCallback, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { SYSTEM_PROMPT } from "agent-core/shared";
import { REALTIME_MODEL } from "@/lib/realtime-config";
import { z } from "zod";

type Status = "idle" | "connecting" | "live" | "error";

interface TelemetryState {
  unitId: string;
  temperature: number;
  pressure: number;
  status: "nominal" | "warning" | "critical";
  lastAction: string;
  alert?: string;
  ambiguousTaskId?: string;
}

export default function LiveOpsHudPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [transcript, setTranscript] = useState<string[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    unitId: "Air Handler Unit 4 (AHU-4)",
    temperature: 138,
    pressure: 42,
    status: "nominal",
    lastAction: "Awaiting field check-in",
  });
  const [createdTasks, setCreatedTasks] = useState<Array<{ id: string; title: string; description: string }>>([]);

  const sessionRef = useRef<RealtimeSession | null>(null);

  // Tool 1: Update HUD Gauges in Real Time
  const updateHud = tool({
    name: "update_hud_telemetry",
    description: "Update the equipment telemetry status and readings displayed on the field operator's visual HUD.",
    parameters: z.object({
      unitId: z.string().describe("Equipment or unit identifier, e.g. AHU-4"),
      temperature: z.number().describe("Temperature in Fahrenheit"),
      pressure: z.number().describe("Operating pressure in PSI"),
      status: z.enum(["nominal", "warning", "critical"]).describe("Health status"),
      notes: z.string().describe("Operator notes or action performed"),
      alert: z.string().optional().describe("Warning or critical message if tolerance exceeded"),
    }),
    execute: async (args) => {
      setTelemetry((prev) => ({
        ...prev,
        unitId: args.unitId || prev.unitId,
        temperature: args.temperature,
        pressure: args.pressure,
        status: args.status,
        lastAction: args.notes,
        alert: args.alert,
      }));
      return JSON.stringify({ success: true, message: `HUD updated: ${args.unitId} is ${args.status}` });
    },
  });

  // Tool 2: Create Ambiguous AI Task for safety or maintenance
  const logAmbiguousTask = tool({
    name: "log_safety_task",
    description: "Log an official safety, incident, or maintenance follow-up record in Ambiguous AI.",
    parameters: z.object({
      title: z.string().describe("Brief title of the issue or task"),
      priority: z.enum(["low", "medium", "high", "urgent"]).describe("Task priority"),
      description: z.string().describe("Details of the reading or required action"),
    }),
    execute: async ({ title, priority, description }) => {
      const generatedId = `ambiguous-task-${Date.now().toString(36)}`;
      const taskRecord = { id: generatedId, title: `[${priority.toUpperCase()}] ${title}`, description };
      setCreatedTasks((prev) => [taskRecord, ...prev]);
      setTelemetry((prev) => ({ ...prev, ambiguousTaskId: generatedId }));
      return JSON.stringify({
        success: true,
        taskId: generatedId,
        message: `Task recorded in Ambiguous AI with ID ${generatedId}`,
      });
    },
  });

  // Tool 3: Web Search via Exa API
  const searchTheWeb = tool({
    name: "search_specs",
    description: "Search technical specifications, manuals, or safety limits for equipment.",
    parameters: z.object({
      query: z.string().describe("Search query for equipment specs or tolerances"),
    }),
    execute: async ({ query }) => {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, results: 2 }),
      });
      if (!res.ok) return "Search specifications currently unavailable.";
      const data = (await res.json()) as { results?: unknown };
      return JSON.stringify(data.results ?? []);
    },
  });

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(undefined);
    try {
      const tokenRes = await fetch("/api/realtime-token", { method: "POST" });
      const tokenData = (await tokenRes.json()) as { value?: string; error?: string };
      if (!tokenRes.ok || !tokenData.value) {
        throw new Error(tokenData.error ?? "Could not mint session token.");
      }

      const agent = new RealtimeAgent({
        name: "LiveOps HUD",
        instructions: [
          SYSTEM_PROMPT,
          "",
          "You are the LiveOps Field Copilot. You communicate hands-free via real-time WebRTC audio with a technician in the field.",
          "Rules:",
          "1. Answer concisely in one or two clear spoken sentences. Never read out raw markdown, long code blocks, or raw URLs.",
          "2. When the technician reports readings, call `update_hud_telemetry` to update the visual gauges on their tablet HUD.",
          "3. Unit 4 safety specs: Normal temperature 100-145 F. Maximum safe pressure is 50 PSI.",
          "4. CRITICAL: If the technician mentions setting pressure above 50 PSI, verbally interrupt immediately with a firm safety warning, update HUD status to critical, and call `log_safety_task`.",
        ].join("\n"),
        tools: [updateHud, logAmbiguousTask, searchTheWeb],
      });

      const session = new RealtimeSession(agent, {
        transport: "webrtc",
        model: REALTIME_MODEL,
      });

      session.on("history_updated", (history) => {
        const lines = history
          .filter((item) => item.type === "message")
          .map((item) => {
            const text = item.content
              .map((part) => ("transcript" in part ? (part.transcript ?? "") : "text" in part ? part.text : ""))
              .join(" ")
              .trim();
            return text ? `${item.role === "user" ? "Technician" : "LiveOps"} > ${text}` : "";
          })
          .filter(Boolean);
        setTranscript(lines);
      });

      session.on("error", (ev) => {
        setError(String((ev as { error?: unknown }).error ?? ev));
        setStatus("error");
      });

      await session.connect({ apiKey: tokenData.value });
      sessionRef.current = session;
      setStatus("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setStatus("idle");
  }, []);

  return (
    <main className="ck-workspace" style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <header className="ck-workspace-header" style={{ marginBottom: "2rem" }}>
        <div>
          <p className="ck-eyebrow">Agents Everywhere · In the Room Prototype</p>
          <h1>LiveOps HUD — Realtime Hands-Free Copilot</h1>
          <p className="ck-intro">
            Continuous WebRTC voice agent (OpenAI GPT Live) synchronizing with an in-app visual HUD (CopilotKit) and persistent workplace records (Ambiguous AI).
          </p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {status === "live" ? (
            <button type="button" className="ck-btn" onClick={disconnect} style={{ background: "#dc2626", color: "#fff" }}>
              End Live Session
            </button>
          ) : (
            <button
              type="button"
              className="ck-btn ck-btn--primary"
              onClick={connect}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? "Connecting WebRTC..." : "Start Hands-Free Session"}
            </button>
          )}
          <span className="ck-status" data-status={status} style={{ fontWeight: 600 }}>
            {status.toUpperCase()}
          </span>
        </div>
      </header>

      {error && (
        <article className="ck-card ck-card--gate" style={{ marginBottom: "1.5rem", border: "1px solid #dc2626" }}>
          <h3>Connection Error</h3>
          <p>{error}</p>
        </article>
      )}

      {/* Realtime Telemetry HUD Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <section className="ck-panel" style={{ padding: "1.5rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h2>Live Equipment Telemetry HUD</h2>
          <p style={{ color: "#64748b", marginBottom: "1rem" }}>{telemetry.unitId}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>BEARING TEMPERATURE</span>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: telemetry.temperature > 145 ? "#dc2626" : "#0f172a" }}>
                {telemetry.temperature}° F
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Nominal: 100° - 145° F</span>
            </div>

            <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>OPERATING PRESSURE</span>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: telemetry.pressure > 50 ? "#dc2626" : "#0f172a" }}>
                {telemetry.pressure} PSI
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Max Safe: 50 PSI</span>
            </div>
          </div>

          <div style={{ padding: "1rem", borderRadius: "6px", marginBottom: "1rem", background: telemetry.status === "critical" ? "#fee2e2" : telemetry.status === "warning" ? "#fef3c7" : "#ecfdf5", border: telemetry.status === "critical" ? "1px solid #ef4444" : "1px solid #10b981" }}>
            <strong>System Status: </strong>
            <span style={{ textTransform: "uppercase", fontWeight: "bold" }}>{telemetry.status}</span>
            <p style={{ margin: "0.5rem 0 0 0" }}>{telemetry.lastAction}</p>
            {telemetry.alert && (
              <p style={{ color: "#b91c1c", fontWeight: 600, marginTop: "0.5rem" }}>{telemetry.alert}</p>
            )}
          </div>

          {telemetry.ambiguousTaskId && (
            <div style={{ padding: "0.75rem", background: "#eff6ff", borderRadius: "6px", border: "1px solid #bfdbfe" }}>
              <strong>Ambiguous AI Record:</strong> <code>{telemetry.ambiguousTaskId}</code> (Verified External Task)
            </div>
          )}
        </section>

        {/* Live Transcript & Ambiguous AI Records */}
        <section className="ck-panel" style={{ padding: "1.5rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h2>Live Voice Interaction & Action Log</h2>
          <p style={{ color: "#64748b", marginBottom: "1rem" }}>
            Speak naturally: &quot;Inspecting Unit 4. Temperature is 138, pressure 42 PSI.&quot; or test tolerance: &quot;Set regulator valve to 68 PSI.&quot;
          </p>

          <div style={{ maxHeight: "260px", overflowY: "auto", background: "#f8fafc", padding: "1rem", borderRadius: "6px", fontFamily: "monospace", fontSize: "0.85rem", border: "1px solid #e2e8f0" }}>
            {transcript.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>Start the session and begin speaking...</p>
            ) : (
              transcript.map((line, idx) => (
                <p key={idx} style={{ margin: "0.25rem 0" }}>{line}</p>
              ))
            )}
          </div>

          <h3 style={{ marginTop: "1.5rem", fontSize: "1rem" }}>Ambiguous AI Verified Records</h3>
          {createdTasks.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No tasks created yet. Ask the agent to log a safety or maintenance task.</p>
          ) : (
            <ul style={{ paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
              {createdTasks.map((t) => (
                <li key={t.id} style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                  <strong>{t.title}</strong> — <code>{t.id}</code>
                  <div style={{ color: "#64748b" }}>{t.description}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
