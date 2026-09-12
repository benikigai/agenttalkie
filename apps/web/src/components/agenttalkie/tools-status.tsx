"use client";

/**
 * Which tools this workspace actually has, read from the live health route
 * rather than hardcoded. A tool is only claimed when the server says it is
 * configured; everything else is shown at its real state, including offline.
 */
import { useEffect, useState } from "react";

type Health = Partial<Record<"voice" | "task" | "research" | "runner" | "storage", string>>;

const TOOLS: { key: keyof Health; name: string; provider: string }[] = [
  { key: "voice", name: "Voice", provider: "GPT-Live" },
  { key: "task", name: "Tasks", provider: "Ambiguous AI" },
  { key: "research", name: "Research", provider: "Exa" },
  { key: "runner", name: "Coding worker", provider: "Ori / OpenRouter" },
  { key: "storage", name: "Storage", provider: "Durable workspace" },
];

const READY = new Set(["configured", "connected"]);

export function ToolsStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agenttalkie/live/health", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 401) return setLocked(true);
        if (!response.ok) return;
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object") setHealth(body as Health);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!health && !locked) return null;

  return <div className="at-tools">
    <p className="at-eyebrow">Tools</p>
    <ul className="at-tools-list">
      {TOOLS.map((tool) => {
        const state = locked ? "locked" : health?.[tool.key] ?? "unconfigured";
        const ready = READY.has(state);
        // A grey dot is not information. Say what an unavailable tool is doing,
        // so nobody asks the agent for something it cannot reach.
        const note = ready ? null : state === "locked" ? "Locked" : state === "offline" ? "Not connected" : "Not configured";
        return <li className={`at-tools-item${ready ? "" : " at-tools-item-off"}`} key={tool.key} title={`${tool.provider}: ${state}`}>
          <span className={`at-tools-dot ${ready ? "at-tools-on" : state === "locked" ? "at-tools-locked" : "at-tools-off"}`} aria-hidden="true" />
          <span className="at-tools-name">{tool.name}</span>
          <span className="at-tools-provider">{tool.provider}{note && <span className="at-tools-note">{note}</span>}</span>
        </li>;
      })}
    </ul>
  </div>;
}
