"use client";
import { useAgentTalkie } from "./provider";
import { VoiceDock } from "./voice-dock";
import { LiveAccess } from "./live-access";
import { AgentTalkieBrand } from "./brand";

export function AgentTalkieShell({ children }: { children: React.ReactNode }) {
  const { snapshot, loading } = useAgentTalkie();
  return <div className="at-shell"><a className="at-sr-only" href="#main-content">Skip to current work</a>
    <header className="at-topbar"><AgentTalkieBrand /><div className="at-top-meta"><span className="at-mode"><span className="at-dot" />{snapshot.session.mode === "fixture" ? "Workspace locked" : "Live workspace"}</span><LiveAccess /></div></header>
    {children}{snapshot.session.mode === "live" && <VoiceDock key={`${snapshot.session.id}:${loading}`} />}
  </div>;
}
